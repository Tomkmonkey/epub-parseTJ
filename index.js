const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Epub = require('node-epub'); // 导入 node-epub
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.epub')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .epub 格式'), false);
    }
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'EPUB 解析服务运行正常',
    timestamp: new Date().toISOString()
  });
});

app.post('/parse-epub', upload.single('epubFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        error: '请上传 EPUB 文件'
      });
    }

    // 使用 node-epub 解析（返回 Promise）
    const book = new Epub(req.file.path);
    const metadata = await book.getMetadata(); // 获取元数据
    const chapters = await book.getChapters(); // 获取章节

    // 删除临时文件
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.warn('临时文件删除失败：', unlinkErr.message);
    }

    // 格式化章节信息
    const formattedChapters = chapters.map((chapter, index) => ({
      chapterIndex: index + 1,
      title: chapter.title || `第 ${index + 1} 章`,
      contentPreview: chapter.content
        ? chapter.content.replace(/<[^>]+>/g, '').substring(0, 300) + '...'
        : '无内容'
    }));

    res.status(200).json({
      code: 200,
      message: '解析成功',
      data: {
        bookMeta: {
          title: metadata.title || '未知标题',
          author: metadata.creator || '未知作者',
          publisher: metadata.publisher || '未知出版社',
          date: metadata.date || '未知日期'
        },
        chapterCount: formattedChapters.length,
        chapters: formattedChapters
      }
    });

  } catch (error) {
    console.error('解析失败：', error.message);
    res.status(500).json({
      code: 500,
      error: '解析失败',
      detail: error.message,
      tip: '请确认文件是有效的 EPUB 格式'
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    code: 404,
    error: '接口不存在',
    availableEndpoints: {
      'GET /health': '健康检查',
      'POST /parse-epub': '上传 EPUB 解析（参数：epubFile）'
    }
  });
});

app.listen(PORT, () => {
  console.log(`服务运行在端口 ${PORT}`);
});

module.exports = app;