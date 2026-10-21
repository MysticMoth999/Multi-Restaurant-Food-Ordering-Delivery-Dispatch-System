// npm test: chạy toàn bộ test tự động — backend (RAM và MySQL) và database. Cần đã chạy npm run setup.
import { step, run, config, ensureMysql } from "./common.mjs";

step("Backend: test nghiệp vụ trên bộ lưu RAM");
run("npm", ["test", "-w", "@gomeal/backend"]);
await ensureMysql(config());
step("Backend: test nghiệp vụ trên MySQL (schema test riêng của backend)");
run("npm", ["run", "test:mysql", "-w", "@gomeal/backend"]);
step("Database: test CSDL (schema test riêng, có 100 vòng tranh chấp, mất vài phút)");
run("npm", ["test", "-w", "@gomeal/database"]);
console.log("\nTất cả test đạt.");
