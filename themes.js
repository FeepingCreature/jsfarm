
var css_default_before = [
  'css/bootstrap.min.css',
  'addon/lint/lint.css',
  'css/codemirror.css'
];

var css_default_after = [
  'css/site.css'
];

var themes = {
  'light': {
    editor_theme: 'neat',
    css: [
      'css/bootstrap-theme.min.css',
      'css/neat.css',
      'css/site-light.css'
    ]
  },
  'dark': {
    editor_theme: 'lesser-dark',
    css: [
      'css/bootstrap-cyborg.min.css',
      'css/lesser-dark.css',
      'css/site-dark.css'
    ]
  }
};

function loadCss(url) {
  var link = document.createElement("link");
  link.href = url;
  link.type = "text/css";
  link.rel = "stylesheet";
  link.className = "theme";
  $('meta').add('link.theme').last().after(link);
}

function loadTheme(theme) {
  $('link.theme').remove();
  var theme = themes[theme];
  for (var i = 0; i < css_default_before.length; i++) {
    loadCss(css_default_before[i]);
  }
  for (var i = 0; i < theme.css.length; i++) {
    loadCss(theme.css[i]);
  }
  for (var i = 0; i < css_default_after.length; i++) {
    loadCss(css_default_after[i]);
  }
  editor_defaults.theme = theme.editor_theme;
  $(window).trigger('change_editor_theme', theme.editor_theme);
}

function setTheme(theme) {
  Cookies.set('theme', theme);
  loadTheme(theme);
}
