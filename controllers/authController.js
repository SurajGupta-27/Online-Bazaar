import userModel from "../models/userModel.js";
import {
  comparePassword,
  DUMMY_HASH,
  findUserByEmail,
  hashPassword,
  isBcryptHash,
  normalizeAnswer,
  normalizeEmail,
} from "./../helpers/authHelper.js";
import {
  googleConfigured,
  GoogleTokenError,
  verifyGoogleCredential,
} from "../helpers/google.js";
import JWT from "jsonwebtoken";
import { alertPreferences } from "../helpers/alertTokens.js";

// Only these fields are ever sent to (and stored by) the browser. The flags say
// how the account can sign in, never the secrets themselves.
const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address,
  role: user.role,
  hasPassword: Boolean(user.password),
  googleLinked: Boolean(user.googleId),
  alerts: alertPreferences(user),
});

// Upgrades legacy data in place: plain-text security answers and
// un-normalized emails. Returns true when the user needs saving. Accounts
// without an answer (Google sign-in) are left without one.
const upgradeLegacyFields = async (user) => {
  let upgraded = false;
  if (user.answer && !isBcryptHash(user.answer)) {
    user.answer = await hashPassword(normalizeAnswer(user.answer));
    upgraded = true;
  }
  if (user.email !== normalizeEmail(user.email)) {
    user.email = normalizeEmail(user.email);
    upgraded = true;
  }
  return upgraded;
};

const signToken = (user) =>
  JWT.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

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
    answer = normalizeAnswer(answer);

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(409).send({
        success: false,
        message: "User is already registered. Please login.",
      });
    }

    const hashedPassword = await hashPassword(password);
    const hashedAnswer = await hashPassword(answer);
    const user = await new userModel({
      name,
      email,
      phone,
      address,
      password: hashedPassword,
      answer: hashedAnswer,
    }).save();

    res.status(201).send({
      success: true,
      message: "User Registered Successfully",
      user: publicUser(user),
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

    const user = await findUserByEmail(userModel, email);

    // Same status, message and timing whether or not the email exists, and
    // for accounts that only sign in with Google (no password).
    const match = await comparePassword(password, user?.password || DUMMY_HASH);
    if (!user || !match) {
      return res.status(401).send({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (await upgradeLegacyFields(user)) await user.save();
    const token = signToken(user);

    res.status(200).send({
      success: true,
      message: "Login successfully",
      user: publicUser(user),
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

// The account a verified Google identity signs in to: the one already linked
// to it, else the account with the same email (which gets linked), else a new
// customer account. Returns { user, created }, or { conflict: true } when the
// email's account is linked to a different Google account.
const userForGoogle = async ({ googleId, email, name }) => {
  const linked = await userModel.findOne({ googleId });
  if (linked) return { user: linked, created: false };

  const existing = await findUserByEmail(userModel, email);
  if (existing) {
    // Linked to this Google account a moment ago by a simultaneous sign-in.
    if (existing.googleId === googleId) return { user: existing, created: false };
    if (existing.googleId) return { conflict: true };
    existing.googleId = googleId;
    await upgradeLegacyFields(existing);
    await existing.save();
    return { user: existing, created: false };
  }

  // Never an admin: role is fixed here, and nothing comes from the request.
  const user = await userModel.create({ name, email, googleId, role: 0 });
  return { user, created: true };
};

// POST GOOGLE SIGN-IN
export const googleLoginController = async (req, res) => {
  try {
    if (!googleConfigured()) {
      return res.status(503).send({
        success: false,
        message: "Google sign-in is not available right now",
      });
    }
    const { credential } = req.body;
    if (typeof credential !== "string" || !credential) {
      return res.status(400).send({ success: false, message: "Google credential is required" });
    }

    let identity;
    try {
      identity = await verifyGoogleCredential(credential);
    } catch (error) {
      if (!(error instanceof GoogleTokenError)) throw error;
      console.log(`Google sign-in rejected: ${error.message}`);
      return res.status(401).send({
        success: false,
        message: "Google sign-in failed. Please try again.",
      });
    }

    let result;
    try {
      result = await userForGoogle(identity);
    } catch (error) {
      // Two sign-ins for the same new account at once: the other one won.
      if (error.code !== 11000) throw error;
      result = await userForGoogle(identity);
    }
    if (result.conflict) {
      return res.status(409).send({
        success: false,
        message: "This email is linked to a different Google account. Log in with your password.",
      });
    }

    const { user, created } = result;
    res.status(created ? 201 : 200).send({
      success: true,
      message: created ? "Account created with Google" : "Login successfully",
      user: publicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in Google sign-in",
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

    const normalizedAnswer = normalizeAnswer(answer);
    const user = await findUserByEmail(userModel, email);

    // Accounts created before answers were hashed still hold plain text;
    // those are compared directly and upgraded to a hash below. Accounts with
    // no answer at all (Google sign-in) can never match.
    const legacyAnswer = Boolean(user?.answer) && !isBcryptHash(user.answer);
    const answerMatches = legacyAnswer
      ? normalizeAnswer(user.answer) === normalizedAnswer
      : await comparePassword(normalizedAnswer, user?.answer || DUMMY_HASH);

    if (!user || !answerMatches) {
      return res.status(400).send({
        success: false,
        message: "Wrong email or security answer",
      });
    }

    const update = { password: await hashPassword(newPassword) };
    if (legacyAnswer) update.answer = await hashPassword(normalizedAnswer);
    if (user.email !== normalizeEmail(user.email)) update.email = normalizeEmail(user.email);
    await userModel.findByIdAndUpdate(user._id, update, { runValidators: true });

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
    res.status(500).send({ success: false, message: "Something went wrong" });
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

    // Blank fields keep their current value. A Google-only account can set a
    // password here, after which it can also log in with email and password.
    // Saved through the document so the model's validators see the whole user.
    if (name?.trim()) user.name = name.trim();
    if (phone?.trim()) user.phone = phone.trim();
    if (address?.trim()) user.address = address.trim();
    if (password) user.password = await hashPassword(password);
    await user.save();

    res.status(200).send({
      success: true,
      message: "Profile Updated Successfully",
      updatedUser: publicUser(user),
    });
  } catch (error) {
    console.log(error);
    res.status(400).send({
      success: false,
      message: "Error while updating profile",
    });
  }
};

// ADMIN: every user (public fields only), newest first.
export const getAllUsersController = async (req, res) => {
  try {
    const users = await userModel
      .find({})
      // The password hash is loaded only so publicUser can report hasPassword.
      .select("-answer")
      .sort({ createdAt: -1 });
    res.status(200).send({
      success: true,
      users: users.map((user) => ({ ...publicUser(user), createdAt: user.createdAt })),
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Unable to load users",
    });
  }
};
