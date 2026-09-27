import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import productModel from "../models/productModel.js";

export const createOrderController = async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ success: false, message: "Cart is empty" });
    }
    if (!shippingAddress) {
      return res.status(400).send({
        success: false,
        message: "A shipping address is required",
      });
    }

    // Merge duplicate lines so each product's stock is checked once, in total.
    const requested = new Map();
    for (const item of items) {
      if (!mongoose.isValidObjectId(item?.product)) {
        return res.status(400).send({ success: false, message: "Invalid product in cart" });
      }
      const quantity = Math.max(1, Math.floor(Number(item.quantity)) || 1);
      const id = String(item.product);
      requested.set(id, (requested.get(id) || 0) + quantity);
    }

    const products = await productModel
      .find({ _id: { $in: [...requested.keys()] } })
      .select("-photo");
    if (products.length !== requested.size) {
      return res.status(400).send({
        success: false,
        message: "One or more products are no longer available",
      });
    }
    const orderItems = products.map((product) => ({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: requested.get(String(product._id)),
    }));

    // Reserve stock with one conditional update per product, so two orders
    // can never both take the last unit. On any failure, return what was taken.
    const reserved = [];
    const releaseReserved = () =>
      Promise.all(
        reserved.map((item) =>
          productModel.updateOne(
            { _id: item.product },
            { $inc: { quantity: item.quantity } }
          )
        )
      );

    let order;
    try {
      for (const item of orderItems) {
        const updated = await productModel.findOneAndUpdate(
          { _id: item.product, quantity: { $gte: item.quantity } },
          { $inc: { quantity: -item.quantity } },
          { projection: { _id: 1 } }
        );
        if (!updated) {
          await releaseReserved();
          return res.status(409).send({
            success: false,
            message: `${item.name} does not have enough stock`,
          });
        }
        reserved.push(item);
      }

      const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      order = await orderModel.create({
        user: req.user._id,
        items: orderItems,
        total,
        shippingAddress,
      });
    } catch (error) {
      await releaseReserved();
      throw error;
    }

    return res.status(201).send({ success: true, message: "Order placed", order });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Unable to place order",
    });
  }
};

export const getMyOrdersController = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ user: req.user._id })
      .populate("items.product", "slug")
      .sort({ createdAt: -1 });
    return res.status(200).send({ success: true, orders });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Unable to load orders",
    });
  }
};
