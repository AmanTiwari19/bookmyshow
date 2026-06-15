const { register, login } = require("./auth.service");

// POST /auth/register
// Body: { email, password, name }
async function registerUser(req, res, next) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        error: "email, password and name are required",
        code: "BAD_REQUEST",
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        error: "password must be at least 6 characters",
        code: "BAD_REQUEST",
      });
    }

    const { user, token } = await register({ email, password, name });
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

// POST /auth/login
// Body: { email, password }
async function loginUser(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "email and password are required",
        code: "BAD_REQUEST",
      });
    }

    const { user, token } = await login({ email, password });
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerUser, loginUser };
