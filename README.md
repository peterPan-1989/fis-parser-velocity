# fis-parser-velocity
A parser for fis to compile velocity template（基于fis的velocity模板解释器）

从0.2.0版本开始，模拟数据文件扩展名从.json变成了.mock，主要考虑velocity tools的需求，.mock文件内容其实是一个`nodejs`模块，可以满足velocity tools调用方法，如`$util.add(1,1)`输出 `2`。

## 组件化实现方法
<pre>
<code>
widget
 ├ header
 | ├ header.vm
 | ├ header.js
 | ├ header.mock
 | └ header.css
</code>
</pre>
使用`#parse('widget/header/header.vm')`指令引入`header`组件，插件会自动将`header.js`和`header.scss`插入html文档中，并将`header.mock`文件的内容作为解析`header`组件的数据源。

默认组件的css和js文件会分别插入`</head>`和`</body>`标签之前，也可以自定义插入位置，css插入占位符为`<!--WIDGET_CSS_HOLDER-->`，js插入占位符为`<!--WIDGET_JS_HOLDER-->`。

.vm或.mock文件修改后，页面会自动重新编译，如果开启了livereload，可以自动刷新预览最新修改。

## 使用方法
```js
fis.match('*.vm', {
  parser: fis.plugin('velocity', {
    // 是否引入js
    loadJs: true,
    // 模块化加载函数 [require|seajs.use]
    // null: 用script标签引入<script src="/widget/a/a.js"></script><script src="/widget/b/b.js"></script>
    // require: require(["/widget/a/a.js", "/widget/b/b.js"]);
    // seajs.use: seajs.use(["/widget/a/a.js", "/widget/b/b.js"]);
    loader: null,
    // 全局macro文件，相对于root
    macro: '/page/macro.vm',
    // 是否编译内容，默认为true，为false时不编译velocity语法，只引用资源依赖
    parse: true,
    // velocity的root配置，默认为项目根目录
    root: [fis.project.getProjectPath()]
  }),
  // 将扩展名发布为html
  rExt: '.html',
  // 以html文件类型作为fis3-postpackager-loader语言分析
  loaderLang: 'html'
});
```
使用模块化框架时，请参考[fis3-postpackager-loader](https://github.com/fex-team/fis3-postpackager-loader)的使用规范，对引用模块化框架的`script`标签加`data-loader`属性，即`<script data-loader src='/path/to/require.js'></script>`，这样才能正确插入`sourcemap`。