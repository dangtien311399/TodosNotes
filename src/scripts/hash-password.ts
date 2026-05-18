import { hashPassword } from "../utils/password.js";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run admin:hash -- <password>");
  console.error('Example: npm run admin:hash -- "MyStrongPass!23"');
  process.exit(1);
}

if (password.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

const hash = await hashPassword(password);

console.log("");
console.log(
  "Bcrypt hash (copy nguyên dòng dưới vào .env hoặc Render env vars):",
);
console.log("");
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log("");
