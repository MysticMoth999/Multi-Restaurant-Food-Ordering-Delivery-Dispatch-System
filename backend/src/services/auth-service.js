import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { ensure, text } from "../domain/errors.js";
import { TOKEN_TTL_MS } from "../domain/constants.js";
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verify(password, stored) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(password, salt, 64));
}
const tokenHash = token => createHash("sha256").update(token).digest("hex");
export const userView = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role
});
export function phone(value) {
  ensure(typeof value === "string" && /^\d{10}$/.test(value), "VALIDATION", "Số điện thoại phải gồm 10 chữ số.");
  return value;
}
export class AuthService {
  constructor(store, clock) {
    this.store = store;
    this.clock = clock;
  }
  async register(body) {
    const email = text(body.email, "email", 254).toLowerCase();
    ensure(/^\S+@\S+\.\S+$/.test(email), "VALIDATION", "Email không hợp lệ.");
    const name = text(body.name, "name", 100);
    const password = text(body.password, "password", 128);
    ensure(password.length >= 6, "VALIDATION", "Mật khẩu tối thiểu 6 ký tự.");
    const contact = body.phone ? phone(body.phone) : null;
    const hash = hashPassword(password);
    return await this.store.transaction(async () => {
      ensure(!(await this.store.find("users", {
        email
      })), "CONFLICT", "Email đã được đăng ký.");
      const id = await this.store.insert("users", {
        email,
        name,
        phone: contact,
        password_hash: hash,
        role: "CUSTOMER"
      });
      return userView(await this.store.user(id));
    });
  }
  async login(body) {
    const email = text(body.email, "email", 254).toLowerCase();
    const password = text(body.password, "password", 128);
    const user = await this.store.find("users", {
      email
    });
    ensure(user && verify(password, user.password_hash), "UNAUTHENTICATED", "Email hoặc mật khẩu không đúng.");
    const driver = await this.store.driver(user.id);
    ensure(!driver?.locked, "FORBIDDEN", "Tài xế đã bị khóa.");
    await this.purgeExpired();
    const token = randomBytes(32).toString("hex");
    const expiresAt = this.clock() + TOKEN_TTL_MS;
    await this.store.insert("sessions", {
      token_hash: tokenHash(token),
      user_id: user.id,
      expires_at: expiresAt
    });
    return {
      token,
      expiresAt,
      user: userView(user)
    };
  }
  async authenticate(token) {
    ensure(typeof token === "string" && token.length === 64, "UNAUTHENTICATED", "Cần đăng nhập.");
    const session = await this.store.find("sessions", {
      token_hash: tokenHash(token)
    });
    if (session && session.expires_at <= this.clock()) {
      await this.store.remove("sessions", {
        token_hash: session.token_hash
      });
    }
    ensure(session && session.expires_at > this.clock(), "UNAUTHENTICATED", "Phiên không hợp lệ hoặc đã hết hạn.");
    const user = await this.store.user(session.user_id);
    ensure(user && !(await this.store.driver(user.id))?.locked, "FORBIDDEN", "Tài khoản đã bị khóa.");
    return user;
  }
  // Phiên hết hạn không còn dùng được; xóa để bộ nhớ không phình khi server chạy lâu.
  async purgeExpired() {
    const now = this.clock();
    // Adapter CSDL xóa bằng một câu lệnh theo index expires_at; MemoryStore dùng vòng lặp.
    if (this.store.purgeSessions) {
      await this.store.purgeSessions(now);
      return;
    }
    for (const session of await this.store.rows("sessions")) {
      if (session.expires_at <= now) {
        await this.store.remove("sessions", {
          token_hash: session.token_hash
        });
      }
    }
  }
  async logout(token) {
    await this.store.remove("sessions", {
      token_hash: tokenHash(token)
    });
  }
  async updatePhone(user, value) {
    await this.store.update("users", {
      id: user.id
    }, {
      phone: phone(value)
    });
    return userView(await this.store.user(user.id));
  }
}
