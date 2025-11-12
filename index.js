const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Epub = require('epubjs'); // 导入 epubjs
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 跨域配置
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// 文件上传配置（Vercel 兼容）
const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 限制
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.epub')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .epub 格式'), false);
    }
  }
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'EPUB 解析服务运行正常',
    timestamp: new Date().toISOString()
  });
});

// 核心解析接口
app.post('/parse-epub', upload.single('epubFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        error: '请上传 EPUB 文件'
      });
    }

    // 使用 epubjs 解析（适配文件路径）
    const book = Epub(req.file.path);
    const metadata = await new Promise((resolve) => book.loaded.metadata.then(resolve));
    const chapters = await new Promise((resolve) => book.loaded.spine.then(resolve));

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
      id: chapter.id,
      contentPreview: chapter.href 
        ? `章节链接：${chapter.href}（内容需通过 epubjs 进一步加载）`
        : '无内容'
    }));

    // 返回结果
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

// 404 处理
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

// 启动服务
app.listen(PORT, () => {
  console.log(`服务运行在端口 ${PORT}`);
});

module.exports = app;