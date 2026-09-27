import bcrypt from "bcrypt";

export const hashPassword = async (password) => {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    console.log(error);
  }
};

export const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

// Compared against when an email isn't registered, so the response takes the
// same time whether or not the account exists.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Security answers are matched case-insensitively ("Cricket" == "cricket").
export const normalizeAnswer = (answer) => answer.trim().toLowerCase();

export const isBcryptHash = (value) => /^\$2[aby]\$\d{2}\$/.test(value || "");