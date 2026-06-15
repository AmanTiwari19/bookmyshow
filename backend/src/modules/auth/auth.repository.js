const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

async function createUser({ email, passwordHash, name }) {
  return prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, createdAt: true },
  });
}

module.exports = { findUserByEmail, createUser };
