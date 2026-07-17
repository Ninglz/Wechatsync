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

自动选择本地文件被浏览器权限限制阻止，上传由用户在当前编辑器的“本地上传”弹窗完成。插入图片后，后续草稿保存请求已经验证：`content` 中含有 `<img>`，`pgc_feed_covers` 非空，`save` 为 `0`，编辑器仍显示“草稿已保存”。

上传接口路径尚未单独采集，因此适配器不直接复刻该请求；它必须在头条号文章编辑页的主页面上下文中触发编辑器已有的图片上传流程，避免硬编码临时签名或图片 URL。

## 实现影响

公开扩展的 service worker 不能伪造动态签名参数。保存草稿和图片上传必须复用已登录的头条号文章编辑器页面，通过 MAIN world 执行路径触发编辑器已有的保存和上传行为。
