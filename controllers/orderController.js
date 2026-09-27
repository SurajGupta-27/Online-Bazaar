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

    const products = await productModel.find({
      _id: { $in: items.map((item) => item.product) },
    });
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const orderItems = items.map((item) => {
      const product = productMap.get(String(item.product));
      if (!product) throw new Error("One or more products are no longer available");
      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (product.quantity < quantity) {
        throw new Error(`${product.name} does not have enough stock`);
      }
      return { product: product._id, name: product.name, price: product.price, quantity };
    });

    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order = await orderModel.create({
      user: req.user._id,
      items: orderItems,
      total,
      shippingAddress,
    });

    await Promise.all(
      orderItems.map((item) =>
        productModel.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity },
        })
      )
    );

    return res.status(201).send({ success: true, message: "Order placed", order });
  } catch (error) {
    return res.status(400).send({
      success: false,
      message: error.message || "Unable to place order",
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
    return res.status(500).send({
      success: false,
      message: "Unable to load orders",
      error: error.message,
    });
  }
};
