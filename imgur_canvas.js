'use strict';

function setReady(div) {
  div.css('cursor', 'pointer');
  div.html("Upload to Imgur");
  div.css('min-width', 'inherit');
  div.css('padding-right', '3px');
  div.off('click');
  div.on('click', function() {
    div.off('click');
    startUploadingToImgur(div);
  });
}

function startUploadingToImgur(div) {
  div.css('min-width', '50%');
  
  var progbar = $('<div class="progress">'+
    '<div class="progress-bar progress-bar-success" role="progressbar" aria-valuenow="0"'+
    'aria-valuemin="0" aria-valuemax="100" style="width:0">'+
    'Uploading'+
    '</div>'+
    '</div>');
  
  div.empty().append(progbar);
  
  function setProgress(val) {
    progbar.find('.progress-bar').
      attr('aria-valuenow', val).
      css('width', val+'%');
  }
  
  var canvas = div.parent().find('canvas');
  if (canvas.length != 1) throw "where is canvas :( is lost";
  var img = canvas[0].toDataURL('image/png').split(',')[1];
  
  // thanks http://stackoverflow.com/questions/17805456/upload-a-canvas-image-to-imgur-api-v3-with-javascript
  // thanks http://www.dave-bond.com/blog/2010/01/JQuery-ajax-progress-HMTL5/
  setAnchorState('image', null); // don't include in the location being shared
  
  var description = "Rendered with JSFarm: http://feephome.no-ip.org/~feep/jsfarm/info.html";
  if ('editor' in window && window['editor'].allClean()) {
    description += "\n\nScene source here: "+window.location;
  } // TODO else save first?
  
  $.ajax({
    url: 'https://api.imgur.com/3/image',
    type: 'POST',
    headers: {Authorization: 'Client-ID fb5f6b8b3eea40a'},
    data: {image: img, description: description},
    dataType: 'json',
    success: function(response) {
      if(response.success) {
        setUploadUrlTo(div, response.data.link);
      } else {
        setReady(div);
      }
    },
    xhr: function() {
      var xhr = $.ajaxSettings.xhr();
      setProgress(0);
      xhr.upload.addEventListener("progress", function(evt){
        if (evt.lengthComputable) {  
          setProgress(evt.loaded * 100 / evt.total);
        }
      }, false);
      return xhr;
    }
  });
}

function setUploadUrlTo(div, url) {
  div.css('min-width', '50%');
  
  setAnchorState('image', url);
  
  var url_input = $('<input type="text"></input>');
  url_input.css('width', '100%');
  url_input.val(url);
  
  // TODO [x]
  url_input.on('keyup', function(e) {
    if (e.which == 27) {
      setReady(div); // dismiss
    }
  });
  div.empty().append(url_input);
  url_input[0].select();
}

window["setupCanvasUpload"] = function(canvas) {
  var wrapper = $('<div></div>');
  wrapper.css('position', 'relative');
  
  var imgur_link = $('<div></div>');
  imgur_link.
    css('position', 'absolute').
    css('top', '2px').
    css('right', '0px').
    css('margin', '4px').
    css('margin-right', '0px').
    css('padding', '2px').
    css('text-align', 'right').
    css('background-color', 'rgba(0,0,0,0.5)').
    css('color', '#fff').
    css('border', '1px solid').
    css('border-radius', '3px').
    css('display', 'none');
  
  setReady(imgur_link);
  
  $(window).on("startRender", function() {
    setReady(imgur_link);
  });
  
  wrapper.append(imgur_link);
  
  canvas.replaceWith(wrapper);
  wrapper.append(canvas);
  
  wrapper.hover(function() {
    imgur_link.fadeIn("fast");
  }, function() {
    imgur_link.fadeOut("fast");
  });
};
