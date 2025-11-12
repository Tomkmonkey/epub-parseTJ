const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Epub = require('epub'); // 导入 epub 库
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

    // 使用 epub 库解析（基于回调，封装为 Promise）
    const book = new Epub(req.file.path);
    const bookData = await new Promise((resolve, reject) => {
      book.on('end', () => resolve(book)); // 解析完成
      book.on('error', (err) => reject(err)); // 错误处理
      book.parse(); // 开始解析
    });

    // 删除临时文件
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.warn('临时文件删除失败：', unlinkErr.message);
    }

    // 提取章节信息（适配 epub 库的结构）
    const chapters = bookData.flow.map((chapter, index) => ({
      chapterIndex: index + 1,
      title: chapter.title || `第 ${index + 1} 章`,
      id: chapter.id,
      contentPreview: chapter.content 
        ? chapter.content.replace(/<[^>]+>/g, '').substring(0, 300) + '...'
        : '无内容'
    }));

    res.status(200).json({
      code: 200,
      message: '解析成功',
      data: {
        bookMeta: {
          title: bookData.metadata.title || '未知标题',
          author: bookData.metadata.creator || '未知作者',
          publisher: bookData.metadata.publisher || '未知出版社',
          date: bookData.metadata.date || '未知日期'
        },
        chapterCount: chapters.length,
        chapters: chapters
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
      'POST /parse-epub': '上传 EPUB 解析'
    }
  });
});

app.listen(PORT, () => {
  console.log(`服务运行在端口 ${PORT}`);
});

module.exports = app;