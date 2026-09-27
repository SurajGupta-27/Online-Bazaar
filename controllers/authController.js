import userModel from "../models/userModel.js";
import { comparePassword, hashPassword } from "./../helpers/authHelper.js";
import JWT from "jsonwebtoken";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const registerController = async (req, res) => {
  try {
    let { name, email, password, phone, address, answer } = req.body;

    if (!name?.trim()) {
      return res.status(400).send({ success: false, message: "Name is Required" });
    }
    if (!email?.trim()) {
      return res.status(400).send({ success: false, message: "Email is Required" });
    }
    if (!password) {
      return res.status(400).send({ success: false, message: "Password is Required" });
    }
    if (password.length < 6) {
      return res.status(400).send({ success: false, message: "Password must be at least 6 characters" });
    }
    if (!phone?.trim()) {
      return res.status(400).send({ success: false, message: "Phone no is Required" });
    }
    if (!address?.trim()) {
      return res.status(400).send({ success: false, message: "Address is Required" });
    }
    if (!answer?.trim()) {
      return res.status(400).send({ success: false, message: "Answer is Required" });
    }

    name = name.trim();
    email = email.trim().toLowerCase();
    phone = phone.trim();
    address = address.trim();
    answer = answer.trim();

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(409).send({
        success: false,
        message: "User is already registered. Please login.",
      });
    }

    const hashedPassword = await hashPassword(password);
    const user = await new userModel({
      name,
      email,
      phone,
      address,
      password: hashedPassword,
      answer,
    }).save();

    res.status(201).send({
      success: true,
      message: "User Registered Successfully",
      user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in registration",
    });
  }
};

// POST LOGIN
export const loginController = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).send({
        success: false,
        message: "Email and password are required",
      });
    }

    email = email.trim().toLowerCase();
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "Email is not registered",
      });
    }

    const match = await comparePassword(password, user.password);
    if (!match) {
      return res.status(401).send({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = JWT.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).send({
      success: true,
      message: "Login successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in login",
    });
  }
};

// FORGOT PASSWORD
export const forgotPasswordController = async (req, res) => {
  try {
    const { email, answer, newPassword } = req.body;

    if (!email?.trim()) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    if (!answer?.trim()) {
      return res.status(400).send({ success: false, message: "Security answer is required" });
    }
    if (!newPassword) {
      return res.status(400).send({ success: false, message: "New password is required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).send({ success: false, message: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.trim();
    const normalizedAnswer = answer.trim();

    // Exact values, but case-insensitive so "Cricket" and "cricket" both work.
    const user = await userModel.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" },
      answer: { $regex: `^${escapeRegex(normalizedAnswer)}$`, $options: "i" },
    });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "Wrong email or security answer",
      });
    }

    const hashed = await hashPassword(newPassword);
    await userModel.findByIdAndUpdate(
      user._id,
      { password: hashed },
      { new: true, runValidators: true }
    );

    res.status(200).send({
      success: true,
      message: "Password Reset Successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Something went wrong while resetting the password",
    });
  }
};

// TEST CONTROLLER
export const testController = (req, res) => {
  try {
    res.send("Protected Routes");
  } catch (error) {
    console.log(error);
    res.send({ error });
  }
};

// UPDATE PROFILE
export const updateProfileController = async (req, res) => {
  try {
    const { name, password, address, phone } = req.body;
    const user = await userModel.findById(req.user._id);

    if (!user) {
      return res.status(404).send({ success: false, message: "User not found" });
    }

    if (password && password.length < 6) {
      return res.status(400).send({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const hashedPassword = password ? await hashPassword(password) : user.password;
    const updatedUser = await userModel.findByIdAndUpdate(
      req.user._id,
      {
        name: name?.trim() || user.name,
        password: hashedPassword,
        phone: phone?.trim() || user.phone,
        address: address?.trim() || user.address,
      },
      { new: true, runValidators: true }
    );

    res.status(200).send({
      success: true,
      message: "Profile Updated Successfully",
      updatedUser,
    });
  } catch (error) {
    console.log(error);
    res.status(400).send({
      success: false,
      message: "Error while updating profile",
    });
  }
};
