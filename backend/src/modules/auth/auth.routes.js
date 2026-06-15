const { Router } = require("express");
const { registerUser, loginUser } = require("./auth.controller");

const router = Router();

// POST /auth/register  — create account, returns { user, token }
// POST /auth/login     — verify credentials, returns { user, token }
router.post("/register", registerUser);
router.post("/login",    loginUser);

module.exports = router;
