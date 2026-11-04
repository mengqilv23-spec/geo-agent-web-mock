# GEO Agent Web Mock

这是原 GEO Agent Web 的独立前端演示副本。目标是在不连接后端或宿主 iframe 的情况下，用本地演示数据走通页面流程；页面布局与样式沿用原项目。

## 启动

```sh
npm install
npm run dev
```

启动后在浏览器打开 Vite 输出的本地地址。演示数据保存在当前浏览器的 `localStorage` 中。

## 重置演示数据

在浏览器开发者工具 Console 执行：

```js
localStorage.removeItem('geo-agent-web-mock:v1')
location.reload()
```

所有业务数据均由前端 mock 服务提供，并按操作写入当前浏览器的 `localStorage`。品牌与市场配置、买家人设、监测问题、竞品确认、监测启停与采集轮次、报告生成、诊断状态和任务流程均可在页面中交互；无需启动后端或登录宿主系统。

清除上述存储键会恢复内置演示数据。不同浏览器或无痕窗口的数据彼此独立。
