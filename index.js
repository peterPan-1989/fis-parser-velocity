var Engine = require('velocity').Engine,
    path = require('path'),
    util = fis.util;

/**
 * 读取页面文件引入组件的同名xxx.mock文件，并将该文件加入页面文件的依赖缓存，用于同步更新
 * @param {String|Array} widgets 组件路径
 * @param {Object} file file实例
 * @param {Array} root root目录设置
 * @return
 *  [Object]
 */
function getContext(widgets, file, root) {
    var context = {};

    if(!widgets) {
        return context;
    }
    widgets = util.isArray(widgets) ? widgets : [widgets];
    widgets.forEach(function(widget) {
        // 如果widget不是file，则需要加入依赖缓存，用于同步更新
        var dep = file.subpath === widget ? false : true;
        widget = getAbsolutePath(replaceExt(widget, '.mock'), root);
        if(widget) {
            util.merge(context, require(widget));
            delete require.cache[widget];

            dep && addDeps(file, widget)
        }
    });

    return context;
}

/**
 * 通过内容获取所有#parse引用的文件
 * @return
 *   [filepath, filepath...]
 */
function getParseFiles(content, root) {
    var result = {
        content: content,
        widgets: [],
        scripts: [],
        styles: []
    };

    result = compileDirective(content, root);

    var getSub = function(filepath, root) {
        var file = getAbsolutePath(filepath, root);
        var content = file ? util.read(file) : '';
        var _tmpResult = compileDirective(content, root);

        result.widgets = result.widgets.concat(_tmpResult.widgets);
        result.scripts = result.scripts.concat(_tmpResult.scripts);
        result.styles = result.styles.concat(_tmpResult.styles);

        _tmpResult.widgets.forEach(function(widget) {
            getSub(widget, root);
        });
    };
    result.widgets.forEach(function(widget) {
        getSub(widget, root);
    });

    return result;
}

/**
 * 编译组件化指令
 * @param  {String} content 文件内容
 * @return {Object} 编译后的文件内容及收集到的依赖资源
 * @example
 * {
 *   content: {String} 编译后的文件内容
 *   widgets: {Array} 引用的组件
 *   scripts: {Array} 依赖的js文件
 *   styles: {Array} 依赖的css文件
 * }
 */
function compileDirective(content, root) {
    var rWidget = /(#?)#widget\(('|")([^\)]+)\2\)/g;
    var rScript = /(#?)#script\(('|")([^\)]+)\2\)/g;
    var rStyle = /(#?)#style\(('|")([^\)]+)\2\)/g;
    var rUri = /(#?)#uri\(('|")([^\)]+)\2\)/g;

    var widgets = [], scripts = [], styles = [];

    // 将#widget变成#parse，并记录引用组件路径
    content = content.replace(rWidget, function(match, comment, qoutes, filepath) {
        if(comment) {
            return match;
        }
        widgets.push(filepath);
        return '#parse("' + filepath + '")';
    });
    // 将#script替换为空，并记录引用路径，用于统一打包策略
    content = content.replace(rScript, function(match, comment, qoutes, filepath) {
        if(comment) {
            return match;
        }
        scripts.push(filepath);
        return '';
    });
    // 将#style替换为空，并记录引用路径，用于统一打包策略
    content = content.replace(rStyle, function(match, comment, qoutes, filepath) {
        if(comment) {
            return match;
        }
        styles.push(filepath);
        return '';
    });
    // 直接引用资源路径，不做依赖处理
    content = content.replace(rUri, function(match, comment, qoutes, filepath) {
        if(comment) {
            return match;
        }
        return filepath;
    });

    // 尝试将组件的js和css文件加入依赖
    widgets.forEach(function(widget) {
        var widget = widget[0] === '/' ? widget : '/' + widget,
            scssFile = replaceExt(widget, '.scss'),
            lessFile = replaceExt(widget, '.less'),
            cssFile = replaceExt(widget, '.css'),
            jsFile = replaceExt(widget, '.js');

        if(getAbsolutePath(scssFile, root)) {
            styles.push(scssFile);
        }
        if(getAbsolutePath(lessFile, root)) {
            styles.push(lessFile);
        }
        if(getAbsolutePath(cssFile, root)) {
            styles.push(cssFile);
        }
        if(getAbsolutePath(jsFile, root)) {
            scripts.push(jsFile);
        }
    });
    return {
        content: content,
        widgets: widgets,
        scripts: scripts,
        styles: styles
    };
}

/** 替换文件的扩展名
 * @example
 * replaceExt('/widget/a/a.html', '.css') => '/widget/a/a.css'
 */
function replaceExt(pathname, ext) {
    return pathname.substring(0, pathname.lastIndexOf('.')) + ext;
}

/**
 * 返回文件绝对路径，因为root为数组，所以每个root都得判断一下
 * @param file {String} 文件相对路径
 * @param root {Array} root目录数组
 * @return {String} 返回文件绝对路径或者null
 */
function getAbsolutePath(file, root) {
    var result = null;
    if(!file || !root || !util.isArray(root)) {
        return result;
    }
    for(var i = 0; i < root.length; i++) {
        if(util.exists(path.join(root[i], file))) {
            result = path.join(root[i], file);
            break;
        }
    }
    return result;
}

/**
 * 添加静态资源依赖
 */
function addStatics(resources, content, opt) {
    var
        // js拼接字符串
        strJs = '',
        // css拼接字符串
        strCss = '',
        // 模块化加载函数名称[requirejs|modjs|seajs]
        loader = opt.loader || null,
        loadSync = opt.loadSync,
        root = opt.root,
        rCssHolder = /<!--\s?WIDGET_CSS_HOLDER\s?-->/,
        rJsHolder = /<!--\s?WIDGET_JS_HOLDER\s?-->/;

    // 拼接script标签
    resources.scripts.forEach(function(js) {
        strJs += '<script src="' + js + '"></script>\n';
    });

    // 模块化加载
    if(loader && resources.scripts.length > 0) {
        // 如果没开启同步加载，先清空strJs
        if(!loadSync) {
            strJs = '';
        }
        switch(loader) {
            case 'require':
            case 'requirejs':
            case 'modjs':
                strJs += '<script>require(["' + resources.scripts.join('","') + '"]);</script>\n';
                break;
            case 'seajs.use':
            case 'seajs':
                strJs += '<script>seajs.use(["' + resources.scripts.join('","') + '"]);</script>\n';
        }
    }

    // 拼接link标签
    resources.styles.forEach(function(css) {
        strCss += '<link rel="stylesheet" href="' + css + '">\n';
    })

    if(rCssHolder.test(content)) {
        content = content.replace(rCssHolder, strCss);
    } else {
        // css放在</head>标签之前
        content = content.replace(/(<\/head>)/i, strCss + '$1');
    }

    if(rJsHolder.test(content)) {
        content = content.replace(rJsHolder, strJs);
    } else {
        // js放在</body>标签之前
        content = content.replace(/(<\/body>)/i, strJs + '$1');
    }

    return content;
}

/**
 * 对文件内容进行渲染
 */
function renderTpl(content, file, opt) {
    var resources,
        context = {},
        commonMock = opt.commonMock,
        root = opt.root,
        parse = opt.parse;

    if (content === '') {
        return content;
    }

    // 获取#parse引入的文件
    resources = getParseFiles(content, root);

    // 添加全局mock到context
    if(commonMock) {
        util.merge(context, require(commonMock));
        delete require.cache[commonMock];
        addDeps(file, commonMock);
    }

    // 将页面文件同名xxx.mock文件加入context
    util.merge(context, getContext(file.subpath, file, root));

    // 将widgets的xxx.mock文件加入context
    util.merge(context, getContext(resources.widgets, file, root));

    // 得到解析后的文件内容
    resources.content = parse ? new Engine(opt).render(context) : resources.content;

    // 添加widgets的js和css依赖到输入内容
    resources.content = addStatics(resources, resources.content, opt);

    return resources.content;
}

/*
 * 对引入本widget的文件添加FIS依赖，当本widget模板文件修改时，自动编译
 * @param {Object} a
 * @param {Object} b
 */
function addDeps(a, b) {
    if (a && a.cache && b) {
        if (b.cache) {
            a.cache.mergeDeps(b.cache);
        }
        a.cache.addDeps(b.realpath || b);
    }
}

/**
 * fis-parser-velocity
 * @param content
 * @param file
 * @param settings
 * @returns {String} 编译后的html内容
 */
module.exports = function(content, file, settings) {
    var opt = require('./config.js');
    util.merge(opt, settings);
    opt.template = content;
    opt.macro = getAbsolutePath(opt.macro, opt.root);
    opt.commonMock = getAbsolutePath(opt.commonMock, opt.root);
    return renderTpl(content, file, opt);
};