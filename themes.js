
var css_default_before = [
  'https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.3.7/css/bootstrap.min.css',
  // 'css/bootstrap.min.css',
  
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.18.2/addon/lint/lint.min.css',
  // 'addon/lint/lint.css',
  
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.18.2/codemirror.min.css'
  // 'css/codemirror.css'
];

var css_default_after = [
  'css/site.css'
];

window["themes"] = {
  'light': {
    editor_theme: 'neat',
    css: [
      'https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.3.7/css/bootstrap-theme.min.css',
      // 'css/bootstrap-theme.min.css',
      'css/neat.css',
      'css/site-light.css'
    ]
  },
  'dark': {
    editor_theme: 'lesser-dark',
    css: [
      'https://cdnjs.cloudflare.com/ajax/libs/bootswatch/3.3.7/cyborg/bootstrap.min.css',
      // 'css/bootstrap-cyborg.min.css',
      'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.18.2/theme/lesser-dark.min.css',
      // 'css/lesser-dark.css',
      'css/site-dark.css'
    ]
  },
  'gray': {
    editor_theme: 'lesser-dark',
    css: [
      'https://cdnjs.cloudflare.com/ajax/libs/bootswatch/3.3.7/slate/bootstrap.min.css',
      // 'css/bootstrap-slate.min.css',
      'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.18.2/theme/lesser-dark.min.css',
      // 'css/lesser-dark.css',
      'css/site-dark.css',
      'css/site-gray.css'
    ]
  }
};


function loadCss(url, onload) {
  var link = document.createElement("link");
  link.href = url;
  link.type = "text/css";
  link.rel = "stylesheet";
  link.className = "theme";
  $(link).load(onload);
  $('meta').add('link.theme').last().after(link);
}

window["loadTheme"] = function(theme) {
  $('link.theme').remove();
  var theme = window["themes"][theme];
  var left = 0;
  var todo = function() {
    left++;
  };
  var done = function() {
    left--;
    if (left == 0) {
      window["editor_defaults"]["theme"] = theme.editor_theme;
      $(window).trigger('change_editor_theme', theme.editor_theme);
      $(window).trigger('css_changed');
    }
  };
  todo(); // don't trigger more than once
  for (var i = 0; i < css_default_before.length; i++) {
    todo();
    loadCss(css_default_before[i], done);
  }
  for (var i = 0; i < theme.css.length; i++) {
    todo();
    loadCss(theme.css[i], done);
  }
  for (var i = 0; i < css_default_after.length; i++) {
    todo();
    loadCss(css_default_after[i], done);
  }
  done();
};

window["setTheme"] = function(theme) {
  Cookies.set('theme', theme);
  window["loadTheme"](theme);
};
