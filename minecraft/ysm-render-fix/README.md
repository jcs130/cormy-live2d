# YSM 重合面修复工具

2026-10-15：可米模型的左上角预览与第一人称袖子出现深浅条纹。
在 Minecraft 1.21.1 / YSM 2.4.1 的隔离单机实例中，原模型可复现；
只删除一侧面片会使部分衣服变暗。保留正反面、增加极薄间距的候选修复消除了本轮观察到的衣服、手臂和腿部条纹。

## 范围

处理 YSM 元数据声明的主模型及手臂模型中，Z 厚度为零、X/Y 尺寸为正、
没有 inflate、仅包含 north/south 两个独立 UV 面的方块。
围绕原平面中心增加 0.01 模型单位（0.000625 格）厚度。
骨骼、旋转轴、动画、UV、人物贴图和署名保持原样。
这适用于从三角网格导出的特定双面平面，不应不加验收地应用于所有模型。

YSM 2.4.1 原始包加载还会拒绝 WebP 作者头像；工具保留原文件，并生成
像素相同的 PNG 及使用正斜杠的元数据引用。正文贴图不转换。

## 使用

Python 3.10+；若包内有 WebP 作者头像，需要 Pillow。
输入包只读，输出必须是不存在的新目录。

```powershell
python patch_zero_depth.py <原包目录> <新包目录> --expect-planes 1259 --version 1.2.1-preview
```

按用户要求去掉可米头上的酒狐面具时，额外传入 `--remove-bone Mask`。
这是精确匹配的显式选项，清空该骨骼的几何但保留骨架和原有动画引用，
因此动画切换也不会再显示面具。可米当前包的 Mask 有 55 个方块，无子骨骼。
不删除猫耳、头发或蝴蝶结；不修改底模署名与许可证。

工具对实际输出做还原比较，确认仅修改目标面片的 origin.z/size.z
及显式指定附件的 cubes；
校验平面中心、源目录及其余文件的 SHA256。输出 `render-fix-report.json`
包含迁移计数和哈希，不包含本机路径或连接凭据。
可米 1.2.0-preview 的预期计数为主模型 1103、手臂 156，共 1259。
已有厚度、负尺寸及其他面片不修改。重复运行在已修复包上会拒绝零命中。

## 原生验证与部署

本次交付：[1.2.1-preview 模型包](releases/cormy-winefox-cream-1.2.1-preview-cat-depthfix.zip)，
[哈希与状态](releases/manifest.json)、[原生截图对照](validation/paperdoll-comparison.png)。
模型包同时包含去面具和薄面修复，模型 ID 仍为 `cormy-winefox-cream`。
从 1.2.0-preview 重建该交付时，使用上面的命令并加上 `--remove-bone Mask`。

已对照原包、删单面候选与薄面候选；薄面候选又在三个视角下各采集 16 帧。
验证实例为 Fabric Loader 0.19.5、YSM 2.4.1、Iris 1.8.8、Sodium 0.6.13，
Complementary Reimagined r5.2.2，单机世界，不接服务器或 Agent 自主循环。
线上 Loader 为 0.16.13，必须再验收完整原设置包和正式服的服务端模型同步。
本工具不会安装模型、重载服务器或改动 YSM/光影配置。

随后完整原设置候选（preview rotation 保持原值）也通过了 16 帧检查；
去面具候选在两个视角又各采集 16 帧，面具消失，衣服与腿部没有复现原条纹。
以上为单机原生观察结果，不等同于正式服完成加载或长期运行验收。

正式服已有针对 YSM Worker 的元数据兼容转换，部署时应优先只替换
`models/main.json` 和 `models/arm.json`，核对输入哈希，并保留服务端
`ysm.json`、纹理、动画与账号绑定。来源说明随包保留，版本记录单独维护。

保留原模型 ID，以免破坏人物绑定。原包、配置和模型分发端都应备份；
由明确的维护窗口统一加载。YSM 服务端 `/ysm model reload` 会影响所有模型及
连接玩家，不应仅为一次本机测试而执行。回退时恢复原模型包。

参考：[YSM 模型结构](https://yesstevemodel.github.io/wiki/struct/)、
[配置](https://yesstevemodel.github.io/wiki/config/)、
[重载命令](https://yesstevemodel.github.io/wiki/command/)。

工具沿用仓库许可证。迁移输出保留输入包的许可证与完整原作者署名；
可米酒狐二创素材使用 CC BY-NC-SA 4.0，具体来源以输入包 ATTRIBUTION.txt 为准。
