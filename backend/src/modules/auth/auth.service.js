const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
const { findUserByEmail, createUser } = require("./auth.repository");

const SALT_ROUNDS = 10;
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRY  = "7d";

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

async function register({ email, password, name }) {
  // 1. Reject duplicate email
  const existing = await findUserByEmail(email);
  if (existing) {
    const err = new Error("Email already registered");
    err.status = 409;
    err.code   = "EMAIL_TAKEN";
    throw err;
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // 3. Persist
  const user  = await createUser({ email, passwordHash, name });
  const token = signToken(user);

  return { user, token };
}

async function login({ email, password }) {
  // 1. Look up user
  const user = await findUserByEmail(email);
  if (!user) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    err.code   = "INVALID_CREDENTIALS";
    throw err;
  }

  // 2. Compare password — bcrypt.compare is timing-safe
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    err.code   = "INVALID_CREDENTIALS";
    throw err;
  }

  // 3. Issue token (never return passwordHash to the client)
  const { passwordHash: _, ...safeUser } = user;
  const token = signToken(safeUser);

  return { user: safeUser, token };
}

module.exports = { register, login };
