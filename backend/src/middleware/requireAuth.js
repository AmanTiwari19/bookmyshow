const jwt = require("jsonwebtoken");

/**
 * Express middleware — verifies the Bearer JWT in the Authorization header.
 *
 * On success:  attaches req.user = { sub, email, name } and calls next().
 * On failure:  returns 401 { error, code: "UNAUTHORIZED" }.
 *
 * Usage: router.post("/hold", requireAuth, controller)
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token      = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required — send a Bearer token",
      code:  "UNAUTHORIZED",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { sub: userId, email, name, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({
      error: "Token invalid or expired",
      code:  "UNAUTHORIZED",
    });
  }
}

module.exports = requireAuth;
