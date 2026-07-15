# 家具配送管理系統 V3

此版本已將網站資料改為儲存在 Supabase。

## Netlify 必須設定的環境變數

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHARED_PIN`

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Netlify，不可放入 GitHub 或前端。

## 更新方式

將本資料夾內所有檔案上傳到原 GitHub Repository 並覆蓋，Commit 後 Netlify 會自動重新部署。
