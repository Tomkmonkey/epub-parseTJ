// 引入所有必需依赖
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const EpubParse = require('epub-parse');
const fs = require('fs');
const path = require('path');

// 初始化 Express 应用
const app = express();
// 适配 Vercel 动态端口（必须使用环境变量）
const PORT = process.env.PORT || 3000;

// 核心配置：解决跨域问题（允许所有域名访问，适合公开服务）
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// 配置文件上传：使用 Vercel 唯一可写入目录 /tmp（无需手动创建）
const upload = multer({
  dest: '/tmp/', // 临时文件存储路径
  limits: { fileSize: 10 * 1024 * 1024 }, // 限制文件大小 10MB（适配 Vercel 免费版限制）
  fileFilter: (req, file, cb) => {
    // 只允许上传 EPUB 文件，增强安全性
    if (file.mimetype === 'application/epub+zip' || file.originalname.endsWith('.epub')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 EPUB 格式文件上传'), false);
    }
  }
});

// 健康检查接口（用于验证服务是否正常运行）
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'EPUB 解析服务正常运行',
    timestamp: new Date().toISOString()
  });
});

// 核心接口：EPUB 文件解析（POST 请求）
app.post('/parse-epub', upload.single('epubFile'), async (req, res) => {
  try {
    // 1. 验证是否上传了文件
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        error: '请上传 EPUB 格式文件'
      });
    }

    // 2. 解析 EPUB 文件（从 /tmp 临时目录读取）
    const book = await EpubParse(req.file.path);

    // 3. 解析完成后删除临时文件（避免占用 Vercel 存储空间）
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.log('临时文件删除失败（不影响核心功能）：', unlinkErr.message);
    }

    // 4. 提取关键信息并返回（结构化 JSON 响应）
    const chapters = book.sections
      .filter(section => section.content) // 过滤空内容章节
      .map(section => ({
        id: section.id || Date.now() + Math.random().toString(36).substr(2, 9), // 生成唯一 ID
        title: section.title || `无标题章节${section.index + 1}`,
        contentPreview: section.content.length > 200 
          ? section.content.substring(0, 200).replace(/<[^>]+>/g, '') + '...' // 去除 HTML 标签，预览前 200 字符
          : section.content.replace(/<[^>]+>/g, ''),
        contentLength: section.content.length // 内容总长度
      }));

    // 5. 返回成功响应
    res.status(200).json({
      code: 200,
      message: '解析成功',
      data: {
        bookInfo: {
          title: book.metadata.title || '未知标题',
          author: book.metadata.creator || '未知作者',
          publisher: book.metadata.publisher || '未知出版社',
          publicationDate: book.metadata.date || '未知出版日期',
          language: book.metadata.language || '未知语言'
        },
        chapterCount: chapters.length,
        chapters: chapters
      }
    });

  } catch (error) {
    // 统一异常处理（返回友好错误信息）
    console.error('解析失败：', error.message);
    res.status(500).json({
      code: 500,
      error: '解析失败',
      detail: error.message
    });
  }
});

// 处理 404 错误（所有未匹配的路由）
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    error: '接口不存在',
    tip: '请使用 POST 方法访问 /parse-epub 接口上传 EPUB 文件'
  });
});

// 启动服务（适配 Vercel Serverless 环境，无需手动停止）
app.listen(PORT, () => {
  console.log(`EPUB 解析服务已启动，端口：${PORT}`);
  console.log(`健康检查地址：http://localhost:${PORT}/health`);
  console.log(`解析接口地址：http://localhost:${PORT}/parse-epub`);
});

// 导出 app 供 Vercel Serverless 识别（关键配置）
module.exports = app;