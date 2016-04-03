<!-- :sigh: -->
#define XSTR(s) STR(s)
#define STR(s) #s
#define QPI           IDENT-QuickProgInfo
#define IMAGE_TAB     IDENT-image-tab
#define IMAGE_PANE    IDENT-image-pane
#define PROGRESS_TAB  IDENT-progress-tab
#define PROGRESS_PANE IDENT-progress-pane
#define RESULT_AREA   IDENT-result-area
#define PROGRESS      IDENT-progress
<div class="render_ui" id=XSTR(IDENT)>
<table><tr><td style="vertical-align:top;width:100%;height:100%;">

<div id="editors">
<ul id="riders" class="nav nav-tabs">
</ul>
<span id="editors_content" class="tab-content">
<textarea id="editor">
#include RFILE
</textarea>
</span>
</div>

</td>
<td>

<div id=XSTR(RESULT_AREA)>
  <ul class="nav nav-tabs" role="tablist">
    <li role="presentation" class="active"><a href=XSTR(#IMAGE_PANE) aria-controls=XSTR(IMAGE_PANE) role="tab" data-toggle="tab" id=XSTR(IMAGE_TAB)>Render</a></li>
    <li role="presentation"><a href=XSTR(#PROGRESS_PANE) aria-controls=XSTR(PROGRESS_PANE) role="tab" data-toggle="tab" id=XSTR(PROGRESS_TAB)>Progress</a></li>
    <li role="presentation" class="label label-outside QuickProgInfo" id=XSTR(QPI)></li>
  </ul>

  <div class="tab-content" style="position:relative;">
    <div role="tabpanel" class="tab-pane active" aria-labelledby=XSTR(IMAGE_TAB) id=XSTR(IMAGE_PANE) style="display: inherit;">
      <div class="canvas-wrapper">
        <canvas class="render-canvas" width=XSTR(WIDTH) height=XSTR(HEIGHT)></canvas>
      </div>
    </div>
    <div role="tabpanel" class="tab-pane panel panel-default progress-pane" aria-labelledby=XSTR(PROGRESS_TAB) id=XSTR(PROGRESS_PANE)>
      <div class="panel-body" style="padding: 0px;">
        <div class="progress-container">
        </div>
      </div>
    </div>
  </div>
</div>

</td></tr></table>

<button type="button" id="RenderButton" onclick="RenderScene($(this).parent('.render_ui'))">Render</button>
<button type="button" id="CancelButton" onclick="CancelRender($(this).parent('.render_ui'))" class="starts-hidden">Cancel</button>
<button type="button" id="SaveButton" onclick="Save($(this).parent('.render_ui'))">Save</button>
&nbsp;|&nbsp;
<label for="width" title="Width of the rendered image. Please be considerate.">Width</label>
<input type="text" size="3" id="width" name="width" value=XSTR(WIDTH)>
<label for="height" title="Height of the rendered image. Please be considerate.">Height</label>
<input type="text" size="3" id="height" name="height" value=XSTR(HEIGHT)>
<label for="quality" title="Passed to the script as param-quality.">Quality</label>
<input type="text" size="4" id="quality" name="quality" value="32">
</div>
<script>
  var dom = document.getElementById(XSTR(IDENT));
  var canvas = $(dom).find('.render-canvas');
  var editor = new EditorUi($(dom));
  dom.editor_ui = editor;
  editor.files = splitSrc($.trim($(dom).find('#editor')[0].value));
  editor.rebuildFileUi(editor.files);
  setupCanvasUpload(canvas);
  $(window).on('change_editor_theme', function(str) {
    for (var i = 0; i < editor.files.length; ++i) {
      var file = editor.files[i];
      file.editor.setOption('theme', theme.editor_theme);
    }
  });
</script>
