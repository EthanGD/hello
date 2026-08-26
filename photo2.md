**Considering image metadata preservation**

I could write metadata directly into image filenames, which might allow reconstruction by scanning the user's album. The user is asking if image.json can be preserved and auto-loaded, but that isn't feasible on iOS since the app can't store the image.json in Photos. However, if naming encodes metadata, I can potentially eliminate the need for a separate JSON file. 

For Android, I can save images and manifest JSON to a public folder for automatic loading, while iOS would need iCloud or a backend for full auto-load after a reinstall.

**Evaluating image preservation on iOS**

When the app is reinstalled, it scans a dedicated album called `MWRecord` to reconstruct the index. However, iOS Photos doesn’t make it easy to preserve custom filenames, as displayed names may change. I need to be cautious here. The PHAssetResource originalFilename might work for imported assets, but images saved through the Photos framework could vary in filename. If using Files/iCloud Drive, I can preserve `images.json`, allowing auto-load if stored in an accessible iCloud container.

**Crafting a concise answer**

I realize I need to respond with a warm and concise answer, maybe even using bullet points since there are multiple questions. I want to include concrete recommendations but with some caveats to keep things clear. Referring to the current code logic in WatermarkService's `buildOutputFileName` and the image index in FileSystemService could be beneficial, but I should also consider whether they're necessary. It's okay to mention these are app-level details and no tools are needed for the response.


可以，但要分开看：

**1. 图片名称 / 副本重命名逻辑**
这个 **可以完整保留**。  
你现在的命名逻辑本质上是应用层规则，不依赖 Android 还是 iOS，只要我们继续把“最终文件名”当成正式主键之一，这套规则就能照搬。

也就是说，像你现在这种：

- 原图
- 加水印后的副本
- 按目录归档
- 按备注 / 地址 / 规格重命名

这些逻辑都能保留，甚至可以比现在更稳。

**2. `images.json` 能不能保留**
也可以，但前提是它**不能只放在 App 沙盒里**。

因为：

- Android：可以放到公共目录，重装后还能读回来
- iOS：如果只放 `Documents/Library`，删 App 就没了

所以要想做到你说的这种：

**“重装 app 也能自动加载”**

必须把 `images.json` 放到 **App 外部的持久位置**。

---

**最关键的一句：**

如果你要同时满足：

- 图片名称完整保留
- 副本命名逻辑完整保留
- `images.json` 保留
- 重装后自动恢复

那最适合的方案是：

- **Android**：继续用公共目录 `MWRecord/`
- **iOS**：改成用 **iCloud Drive 的 `MWRecord/` 文件夹**
- 两边都放：
  - 图片文件
  - 副本文件
  - `images.json`

这样启动时就可以：

1. 先检查外部持久目录有没有 `images.json`
2. 有的话直接加载
3. 按 `images.json` 恢复目录树、图片列表、命名关系
4. 需要编辑时再把图片复制回 App 工作目录

---

**这样做的效果是：**

- 文件名保留
- 重命名规则保留
- `images.json` 保留
- 重装后自动恢复
- Android / iOS 逻辑统一

---

**但要注意一个现实限制：**

如果 iOS **不用 iCloud / 后端**，只靠本地，是做不到“删 App 后还自动恢复 `images.json`”的。  
这是 iOS 系统限制，不是代码问题。

所以 iOS 这边有 3 个级别：

1. **最完整**：`iCloud Drive + images.json`  
   - 可自动恢复
   - 文件名可保留
   - 最接近 Android 体验

2. **次优**：系统相簿保存图片  
   - 图片能留住
   - 但 `images.json` 不一定能自动保留
   - 目录结构和重命名恢复会比较弱

3. **最低配**：App 沙盒里存  
   - 现在这样
   - 重装必丢

---

**我的建议很明确：**

把现在的 `images.json` 升级成真正的主清单文件，然后做成：

- `MWRecord/images.json`
- `MWRecord/目录/图片.jpg`
- `MWRecord/目录/副本.jpg`

启动时优先读取外部 `images.json`，再回填到 `AsyncStorage` 当缓存。

这样你要的“命名逻辑保满 + 重装自动加载”才是真的成立。

如果你点头，我下一步可以直接帮你出一版**可实施的改造设计**，我会精确写到：

- 哪些现有 TS 文件要改
- `images.json` 要加哪些字段
- Android / iOS 各自存哪里
- App 启动时怎么自动恢复
- 哪些逻辑可以复用你现有代码，尽量少动