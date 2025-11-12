// 引入核心依赖（已修正 epub-parse 导入方式）
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { parse: EpubParse } = require('epub-parse'); // 关键：使用命名导出的 parse 方法
const fs = require('fs');
const path = require('path');

// 初始化 Express 应用
const app = express();
// 适配 Vercel 动态端口（必须使用环境变量）
const PORT = process.env.PORT || 3000;

// 跨域配置（允许所有来源，适合公开服务）
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// 配置文件上传（适配 Vercel 只读文件系统）
const upload = multer({
  dest: '/tmp/', // 唯一可写入的临时目录
  limits: { fileSize: 10 * 1024 * 1024 }, // 限制 10MB 以内的文件（Vercel 免费版限制）
  fileFilter: (req, file, cb) => {
    // 仅允许 EPUB 格式（.epub 后缀或对应 MIME 类型）
    if (file.originalname.endsWith('.epub') || file.mimetype === 'application/epub+zip') {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .epub 格式文件'), false);
    }
  }
});

// 健康检查接口（快速验证服务状态）
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'EPUB 解析服务运行正常',
    timestamp: new Date().toISOString(),
    endpoint: 'POST /parse-epub（上传 EPUB 文件）'
  });
});

// 核心接口：解析 EPUB 文件
app.post('/parse-epub', upload.single('epubFile'), async (req, res) => {
  try {
    // 1. 验证文件是否上传
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        error: '未检测到文件，请上传 EPUB 格式文件'
      });
    }

    // 2. 解析 EPUB（使用修正后的方法）
    const book = await EpubParse(req.file.path);

    // 3. 解析完成后删除临时文件（避免占用空间）
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.warn('临时文件删除失败（不影响结果）：', unlinkErr.message);
    }

    // 4. 提取并格式化章节信息（过滤空内容，去除 HTML 标签）
    const chapters = book.sections
      .filter(section => section.content && section.content.trim() !== '')
      .map((section, index) => ({
        chapterIndex: index + 1,
        title: section.title || `第 ${index + 1} 章（无标题）`,
        contentPreview: section.content
          .replace(/<[^>]+>/g, '') // 移除 HTML 标签
          .substring(0, 300) + (section.content.length > 300 ? '...' : ''),
        rawContentLength: section.content.length
      }));

    // 5. 返回成功响应
    res.status(200).json({
      code: 200,
      message: '解析成功',
      data: {
        bookMeta: {
          title: book.metadata.title || '未知标题',
          author: book.metadata.creator || '未知作者',
          publisher: book.metadata.publisher || '未知出版社',
          publishDate: book.metadata.date || '未知日期',
          language: book.metadata.language || '未知语言'
        },
        chapterCount: chapters.length,
        chapters: chapters
      }
    });

  } catch (error) {
    // 统一错误处理（返回具体原因便于排查）
    console.error('解析失败:', error.stack);
    res.status(500).json({
      code: 500,
      error: '解析失败',
      detail: error.message,
      tip: '请检查文件是否为 valid EPUB 格式，或尝试较小的文件'
    });
  }
});

// 404 处理（未匹配的路由）
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    error: '接口不存在',
    availableEndpoints: {
      'GET /health': '服务健康检查',
      'POST /parse-epub': '上传 EPUB 文件并解析（参数名：epubFile）'
    }
  });
});

// 启动服务（Vercel 会自动管理，本地测试用）
app.listen(PORT, () => {
  console.log(`服务已启动，端口：${PORT}`);
  console.log(`健康检查：http://localhost:${PORT}/health`);
});

// 导出 app 供 Vercel Serverless 识别（必须）
module.exports = app;