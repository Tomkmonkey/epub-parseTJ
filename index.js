const express = require('express');
const cors = require('cors');
const multer = require('multer');
const EpubParse = require('epub-parse');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;  // 必须用环境变量端口，Vercel 会自动分配

// 配置跨域
app.use(cors());

// 配置文件上传（临时存储到 uploads 文件夹）
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });

// 解析 EPUB 的 API 端点（接收上传的 EPUB 文件）
app.post('/parse-epub', upload.single('epubFile'), async (req, res) => {
  try {
    const epubFile = req.file;  // 获取上传的文件信息
    if (!epubFile) {
      return res.status(400).json({ error: '请上传 EPUB 文件' });
    }

    // 解析 EPUB 文件
    const book = await EpubParse(epubFile.path);

    // 解析完成后删除临时文件（避免占用空间）
    fs.unlinkSync(epubFile.path);

    // 返回解析结果（提取标题、作者、章节等信息）
    res.json({
      title: book.metadata.title || '未知标题',
      author: book.metadata.creator || '未知作者',
      chapters: book.sections.map(section => ({
        title: section.title || '无标题',
        contentPreview: section.content.substring(0, 200) + '...'  // 预览前 200 字符
      }))
    });
  } catch (error) {
    res.status(500).json({ error: '解析失败：' + error.message });
  }
});

// 启动服务
app.listen(port, () => {
  console.log(`服务运行在端口 ${port}`);
});