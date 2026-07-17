# 头条号草稿保存请求契约

采集时间：2026-07-17。采集方式：已登录头条号后台的无害测试草稿自动保存。

## 边界

- 页面状态在请求前后均显示“草稿已保存”。
- 未点击“预览并发布”、定时发布或任何审核提交入口。
- 本文不保存 cookie、`msToken`、`a_bogus`、账号 ID、草稿 ID、标题、正文或图片 URL。

## 草稿保存

- URL 路径：`/mp/agw/article/publish`
- 方法：`POST`
- 查询参数：平台在浏览器上下文中动态生成 `source`、`type`、`aid`、`mp_publish_ab_val`、`msToken` 和 `a_bogus`。适配器不得硬编码这些值。
- 请求格式：`application/x-www-form-urlencoded`
- 已观察到的字段：

```text
pgc_id, source, extra, content, title, search_creation_info, title_id,
mp_editor_stat, is_refute_rumor, save, entrance, timer_status, timer_time,
educluecard, draft_form_data, pgc_feed_covers, article_ad_type,
is_fans_article, govern_forward, praise, disable_praise, tree_plan_article,
star_order_id, star_order_name, activity_tag, trends_writing_tag,
claim_exclusive
```

- 成功响应：HTTP 200，顶层字段为 `code`、`data`、`err_no`、`message`、`now`、`reason`；`data` 含 `content`、`pgc_feed_covers` 和 `pgc_id`。

## 图片上传

自动选择本地文件被浏览器权限限制阻止，尚未采集上传请求。联调时由用户在当前编辑器的“本地上传”弹窗手动选择无害图片；采集的请求只记录路径、方法、字段名与响应字段名，不记录图片内容或 URL。

## 实现影响

公开扩展的 service worker 不能伪造动态签名参数。保存草稿必须复用已登录的头条号页面上下文，通过现有 `TOUTIAO_PAGE_FETCH` 通道或等效的 MAIN world 执行路径发送请求。
