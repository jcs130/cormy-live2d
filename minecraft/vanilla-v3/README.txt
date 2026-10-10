可米 Cormy · 普通 Minecraft 皮肤 v3

默认推荐 cormy-slim-64x64.png，上传时选择 Slim / Alex / 细手臂。
需要普通手臂时用 cormy-classic-64x64.png，选择 Classic / Steve。
游戏设置中打开帽子、夹克、两边袖子和裤腿，才能显示完整第二层。

本次重绘
- 收掉白发和外套上的杂色，保留清楚的奶白块面。
- 重绘琥珀眼、轻腮红、收拢的下巴与短刘海。
- 缩小并打散头顶橘色花纹，避免两条竖直色块。
- 重画可可色内搭、米色短裤、皮带与袜靴，减少服装正面杂纹。
- 背部保留橘色爱心；橘白尾纹留在单独一条后腿上，走路不会跨腿扯开。
- 灯饰画在头部第二层，与发上的深色结相连。

这是原版 64×64 皮肤，没有额外模型网格。猫耳配色、灯饰和尾纹是平面纹理。
reference/design-guide.png 是 image_gen 的美术参考，不是游戏截图或可上传的皮肤。
preview/fullbody.png、face.png、walk.png、run.png、classic.png 是同一最终 PNG 的真实浏览器渲染。

预览：用 Node 运行 source/serve.cjs，打开它输出的网址。无需联网加载 CDN。
重建：在 source 中 npm install，再 npm run build、npm run validate。
也可以设置 CORMY_SHARP 为已有 sharp 安装目录。制作入口为 source/build-skins.cjs。
每个字符对应一个原生皮肤像素；不是缩放概念图得到的材质。

已核验：两种手臂、完整基础面不透明、六组第二层、未用 UV 透明、正背侧面与走跑。
服务器传播及实际玩家渲染另需验收，不能仅由此预览认定已在服务器生效。
穿着头盔、盔甲会遮挡皮肤的对应部位。

角色与美术素材的使用范围沿用 cormy-live2d 仓库既有声明，没有新增开放授权。
制作脚本沿用仓库 GPL-3.0；预览使用 skinview3d、skinview-utils 与 Three.js（MIT）。
第三方许可保存在 preview/vendor。包内不含私人家庭猫照片。
