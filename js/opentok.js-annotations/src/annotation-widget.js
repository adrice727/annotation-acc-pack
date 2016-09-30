/*!
 *  Annotation Plugin for OpenTok
 *
 *  @Author: Trevor Boyer
 *  @Copyright (c) 2015 TokBox, Inc
 **/

/* eslint-disable */

/** Analytics */
(function () {

  var _OTKAnalytics;
  var _otkanalytics;
  var _session;


  // vars for the analytics logs. Internal use
  var _logEventData = {
    clientVersion: 'js-vsol-1.0.0',
    componentId: 'annotationsAccPack',
    name: 'guidAnnotationsKit',
    actionStartDrawing: 'StartDrawing',
    actionEndDrawing: 'EndDrawing',
    variationSuccess: 'Success',
  };

  var _logAnalytics = function () {
    // init the analytics logs
    var _source = window.location.href;

    var otkanalyticsData = {
      clientVersion: _logEventData.clientVersion,
      source: _source,
      componentId: _logEventData.componentId,
      name: _logEventData.name
    };

    _otkanalytics = new _OTKAnalytics(otkanalyticsData);

    var sessionInfo = {
      sessionId: _session.id,
      connectionId: _session.connection.connectionId,
      partnerId: _session.apiKey
    };

    _otkanalytics.addSessionInfo(sessionInfo);
  };

  var _log = function (action, variation) {
    var data = {
      action: action,
      variation: variation
    };
    _otkanalytics.logEvent(data);
  };

  /** End Analytics */


  //--------------------------------------
  //  OPENTOK ANNOTATION CANVAS/VIEW
  //--------------------------------------
  var DEFAULT_ASSET_URL = 'https://assets.tokbox.com/solutions/images/';

  OTSolution = this.OTSolution || {};

  OTSolution.Annotations = function (options) {

    options = options || {};
    this.widgetVersion = 'js-1.0.0-beta';
    this.parent = options.container;
    this.videoFeed = options.feed;
    this.imageAssets = options.imageAssets || DEFAULT_ASSET_URL;

    _OTKAnalytics = _OTKAnalytics || options.OTKAnalytics;
    if (!_otkanalytics) {
      _logAnalytics();
    }


    var context = options.externalWindow ? options.externalWindow.document : window.document;

    var self = this;

    if (this.parent) {
      var canvas = document.createElement('canvas');
      canvas.setAttribute('id', 'opentok_canvas'); // session.connection.id?
      canvas.style.position = 'absolute';
      this.parent.appendChild(canvas);
      canvas.setAttribute('width', this.parent.clientWidth + 'px');
      canvas.style.width = window.getComputedStyle(this.parent).width;
      canvas.setAttribute('height', this.parent.clientHeight + 'px');
      canvas.style.height = window.getComputedStyle(this.parent).height;
    }

    var self = this,
      ctx,
      cbs = [],
      isPublisher,
      mirrored,
      scaledToFill,
      batchUpdates = [],
      drawHistory = [],
      drawHistoryReceivedFrom,
      updateHistory = [],
      eventHistory = [],
      isStartPoint = false,
      client = {
        dragging: false
      };



    // INFO Mirrored feeds contain the OT_mirrored class
    isPublisher = (' ' + self.videoFeed.element.className + ' ').indexOf(' ' + 'OT_publisher' + ' ') > -1;
    mirrored = isPublisher ? (' ' + self.videoFeed.element.className + ' ').indexOf(' ' + 'OT_mirrored' + ' ') > -1 : false;
    scaledToFill = (' ' + self.videoFeed.element.className + ' ').indexOf(' ' + 'OT_fit-mode-cover' + ' ') > -1;

    this.canvas = function () {
      return canvas;
    };

    /**
     * Links an OpenTok session to the annotation canvas. Typically, this is automatically linked
     * when using {@link Toolbar#addCanvas}.
     * @param session The OpenTok session.
     */
    this.link = function (session) {
      this.session = session;
    };

    /**
     * Changes the active annotation color for the canvas.
     * @param color The hex string representation of the color (#rrggbb).
     */
    this.changeColor = function (color) {
      self.userColor = color;
      if (!self.lineWidth) {
        self.lineWidth = 2; // TODO Default to first option in list of line widths
      }
    };

    /**
     * Changes the line/stroke width of the active annotation for the canvas.
     * @param size The size in pixels.
     */
    this.changeLineWidth = function (size) {
      this.lineWidth = size;
    };

    /**
     * Sets the selected menu item from the toolbar. This is typically handled
     * automatically by the toolbar, but can be used to programmatically select an item.
     * @param item The menu item to set as selected.
     */
    this.selectItem = function (item) {
      if (self.overlay) {
        self.parent.removeChild(self.overlay);
        self.overlay = null;
      }

      if (item.id === 'OT_capture') {
        self.captureScreenshot();
      } else if (item.id.indexOf('OT_line_width') !== -1) {
        if (item.size) {
          self.changeLineWidth(item.size);
        }
      } else {
        self.selectedItem = item;
      }
    };

    /**
     * Sets the color palette for the color picker
     * @param colors The array of hex color strings (#rrggbb).
     */
    this.colors = function (colors) {
      this.colors = colors;
      this.changeColor(colors[0]);
    };

    /**
     * Clears the canvas for the active user. Only annotations added by the active OpenTok user will
     * be removed, leaving the history of all other annotations.
     */
    this.clear = function () {
      clearCanvas(false, self.session.connection.connectionId);
      if (self.session) {
        self.session.signal({
          type: 'otAnnotation_clear'
        });
      }
    };

    this.undo = function () {
      undoLast(false, self.session.connection.connectionId);
      if (self.session) {
        self.session.signal({
          type: 'otAnnotation_undo'
        });
      }
    }

    // TODO Allow the user to choose the image type? (jpg, png) Also allow size?
    /**
     * Captures a screenshot of the annotations displayed on top of the active video feed.
     */
    this.captureScreenshot = function () {

      var canvasCopy = document.createElement('canvas');
      canvasCopy.width = canvas.width;
      canvasCopy.height = canvas.height;

      var width = self.videoFeed.videoWidth();
      var height = self.videoFeed.videoHeight();

      var scale = 1;

      var offsetX = 0;
      var offsetY = 0;

      if (scaledToFill) {
        if (width < height) {
          scale = canvas.width / width;
          width = canvas.width;
          height = height * scale;
        } else {
          scale = canvas.height / height;
          height = canvas.height;
          width = width * scale;
        }

      } else {
        if (width > height) {
          scale = canvas.width / width;
          width = canvas.width;
          height = height * scale;
        } else {
          scale = canvas.height / height;
          height = canvas.height;
          width = width * scale;
        }
      }

      // If stretched to fill, we need an offset to center the image
      offsetX = (width - canvas.width) / 2;
      offsetY = (height - canvas.height) / 2;

      // Combine the video and annotation images
      var image = new Image();
      image.onload = function () {
        var ctxCopy = canvasCopy.getContext('2d');
        if (mirrored) {
          ctxCopy.translate(width, 0);
          ctxCopy.scale(-1, 1);
        }
        ctxCopy.drawImage(image, offsetX, offsetY, width, height);

        // We want to make sure we draw the annotations the same way, so we need to flip back
        if (mirrored) {
          ctxCopy.translate(width, 0);
          ctxCopy.scale(-1, 1);
        }
        ctxCopy.drawImage(canvas, 0, 0);

        cbs.forEach(function (cb) {
          cb.call(self, canvasCopy.toDataURL());
        });

        // Clear and destroy the canvas copy
        canvasCopy = null;
      };
      image.src = 'data:image/png;base64,' + self.videoFeed.getImgData();


    };

    this.onScreenCapture = function (cb) {
      cbs.push(cb);
    };

    this.onResize = function () {
      drawHistory = [];

      drawUpdates(updateHistory, true);

      eventHistory.forEach(function (history) {
        updateCanvas(history, true);
      });
    };

    /** Canvas Handling **/

    function addEventListeners(el, s, fn) {
      var evts = s.split(' ');
      for (var i = 0, iLen = evts.length; i < iLen; i++) {
        el.addEventListener(evts[i], fn, true);
      }
    }

    function updateCanvas(event, resizeEvent) {

      // Ensure that our canvas has been properly sized
      if (canvas.width === 0) {
        canvas.width = self.parent.getBoundingClientRect().width;
      }

      if (canvas.height === 0) {
        canvas.height = self.parent.getBoundingClientRect().height;
      }

      var baseWidth = !!resizeEvent ? event.canvas.width : self.parent.clientWidth;
      var baseHeight = !!resizeEvent ? event.canvas.height : self.parent.clientHeight;
      var offsetLeft = !!resizeEvent ? event.canvas.offsetLeft : canvas.offsetLeft;
      var offsetTop = !!resizeEvent ? event.canvas.offsetTop : canvas.offsetTop;

      var scaleX = canvas.width / baseWidth;
      var scaleY = canvas.height / baseHeight;

      var offsetX = event.offsetX || event.pageX - offsetLeft ||
        (event.changedTouches && event.changedTouches[0].pageX - offsetLeft);
      var offsetY = event.offsetY || event.pageY - offsetTop ||
        (event.changedTouches && event.changedTouches[0].pageY - offsetTop);
      var x = offsetX * scaleX;
      var y = offsetY * scaleY;

      var update;
      var selectedItem = resizeEvent ? event.selectedItem : self.selectedItem;

      if (selectedItem) {
        if (selectedItem.id === 'OT_pen') {

          switch (event.type) {
            case 'mousedown':
            case 'touchstart':
              client.dragging = true;
              client.lastX = x;
              client.lastY = y;
              self.isStartPoint = true;
              !resizeEvent && _log(_logEventData.actionStartDrawing, _logEventData.variationSuccess);
              break;
            case 'mousemove':
            case 'touchmove':
              if (client.dragging) {
                update = {
                  id: self.videoFeed.stream.connection.connectionId,
                  fromId: self.session.connection.connectionId,
                  fromX: client.lastX,
                  fromY: client.lastY,
                  toX: x,
                  toY: y,
                  color: resizeEvent ? event.userColor : self.userColor,
                  lineWidth: self.lineWidth,
                  videoWidth: self.videoFeed.videoElement().clientWidth,
                  videoHeight: self.videoFeed.videoElement().clientHeight,
                  canvasWidth: canvas.width,
                  canvasHeight: canvas.height,
                  mirrored: mirrored,
                  startPoint: self.isStartPoint, // Each segment is treated as a new set of points
                  endPoint: false,
                  selectedItem: selectedItem,
                  guid: event.guid
                };
                draw(update, true);
                client.lastX = x;
                client.lastY = y;
                !resizeEvent && sendUpdate(update);
                self.isStartPoint = false;
              }
              break;
            case 'mouseup':
            case 'touchend':
              client.dragging = false;
              update = {
                id: self.videoFeed.stream.connection.connectionId,
                fromId: self.session.connection.connectionId,
                fromX: client.lastX,
                fromY: client.lastY,
                toX: x,
                toY: y,
                color: resizeEvent ? event.userColor : self.userColor,
                lineWidth: self.lineWidth,
                videoWidth: self.videoFeed.videoElement().clientWidth,
                videoHeight: self.videoFeed.videoElement().clientHeight,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                mirrored: mirrored,
                startPoint: self.isStartPoint, // Each segment is treated as a new set of points
                endPoint: true,
                selectedItem: selectedItem,
                guid: event.guid
              };
              draw(update, true);
              client.lastX = x;
              client.lastY = y;
              !resizeEvent && sendUpdate(update);
              self.isStartPoint = false;
              !resizeEvent && _log(_logEventData.actionEndDrawing, _logEventData.variationSuccess);
              break;
            case 'mouseout':
              client.dragging = false;
          }
        } else if (selectedItem.id === 'OT_text') {

          update = {
            id: self.videoFeed.stream.connection.connectionId,
            fromId: self.session.connection.connectionId,
            fromX: x,
            fromY: y + event.inputHeight, // Account for the height of the text input
            color: event.userColor,
            font: event.font,
            text: event.text,
            videoWidth: self.videoFeed.videoElement().clientWidth,
            videoHeight: self.videoFeed.videoElement().clientHeight,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            mirrored: mirrored,
            selectedItem: selectedItem,
            guid: event.guid
          };

          draw(update);
          !resizeEvent && sendUpdate(update);
        } else {
          // We have a shape or custom object

          // We are currently using a constant default width for shapes
          var shapeLineWidth = 2;

          if (selectedItem && selectedItem.points) {
            client.mX = x;
            client.mY = y;

            switch (event.type) {
              case 'mousedown':
              case 'touchstart':
                client.isDrawing = true;
                client.dragging = true;
                client.startX = x;
                client.startY = y;
                break;
              case 'mousemove':
              case 'touchmove':
                if (client.dragging) {
                  update = {
                    color: resizeEvent ? event.userColor : self.userColor,
                    lineWidth: resizeEvent ? event.lineWidth : shapeLineWidth,
                    selectedItem: selectedItem
                      // INFO The points for scaling will get added when drawing is complete
                  };

                  draw(update, true);
                }
                break;
              case 'mouseup':
              case 'touchend':
                client.isDrawing = false;

                var points = selectedItem.points;

                if (points.length === 2) {
                  update = {
                    id: self.videoFeed.stream.connection.connectionId,
                    fromId: self.session.connection.connectionId,
                    fromX: client.startX,
                    fromY: client.startY,
                    toX: client.mX,
                    toY: client.mY,
                    color: resizeEvent ? event.userColor : self.userColor,
                    lineWidth: resizeEvent ? event.lineWidth : shapeLineWidth,
                    videoWidth: self.videoFeed.videoElement().clientWidth,
                    videoHeight: self.videoFeed.videoElement().clientHeight,
                    canvasWidth: canvas.width,
                    canvasHeight: canvas.height,
                    mirrored: mirrored,
                    smoothed: false,
                    startPoint: true,
                    selectedItem: selectedItem,
                    guid: event.guid
                  };

                  drawHistory.push(update);

                  !resizeEvent && sendUpdate(update);
                } else {
                  var scale = scaleForPoints(points);

                  for (var i = 0; i < points.length; i++) {
                    var firstPoint = false;
                    var endPoint = false;

                    // Scale the points according to the difference between the start and end points
                    var pointX = client.startX + (scale.x * points[i][0]);
                    var pointY = client.startY + (scale.y * points[i][1]);

                    if (i === 0) {
                      client.lastX = pointX;
                      client.lastY = pointY;
                      firstPoint = true;
                    } else if (i === points.length - 1) {
                      endPoint = true;
                    }

                    update = {
                      id: self.videoFeed.stream.connection.connectionId,
                      fromId: self.session.connection.connectionId,
                      fromX: client.lastX,
                      fromY: client.lastY,
                      toX: pointX,
                      toY: pointY,
                      color: resizeEvent ? event.userColor : self.userColor,
                      lineWidth: resizeEvent ? event.lineWidth : shapeLineWidth,
                      videoWidth: self.videoFeed.videoElement().clientWidth,
                      videoHeight: self.videoFeed.videoElement().clientHeight,
                      canvasWidth: canvas.width,
                      canvasHeight: canvas.height,
                      mirrored: mirrored,
                      smoothed: selectedItem.enableSmoothing,
                      startPoint: firstPoint,
                      endPoint: endPoint,
                      guid: event.guid

                    };

                    drawHistory.push(update);

                    !resizeEvent && sendUpdate(update);

                    client.lastX = pointX;
                    client.lastY = pointY;
                  }

                  draw(null);
                }

                client.dragging = false;
            }
          }
        }
      }
    }

    function guid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0,
          v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    addEventListeners(canvas, 'mousedown mousemove mouseup mouseout touchstart touchmove touchend', function (event) {

      // Handle text annotation separately and ignore mouse movements if we're not dragging.
      var istextEvent = self.selectedItem && self.selectedItem.id === 'OT_text';
      var notDragging = event.type === 'mousemove' && !client.dragging;

      if (istextEvent || notDragging) {
        return;
      }

      event.preventDefault();

      // Save raw events to reprocess on canvas resize
      event.selectedItem = self.selectedItem;

      if (event.selectedItem) {
        event.canvas = {
          width: canvas.width,
          height: canvas.height,
          offsetLeft: canvas.offsetLeft,
          offsetTop: canvas.offsetTop
        };

        event.userColor = self.userColor;
        event.lineWidth = self.lineWidth;
        event.guid = guid();
        eventHistory.push(event);
      }

      updateCanvas(event);

    });

    /**
     * We need intermediate event handling for text annotation since the user is adding
     * text to an input element before it is actually added to the canvas.  The original
     * click event is assigned to textEvent, which is then updated before being passed
     * to updateCanvas.
     */

    /** Listen for a click on the canvas.  When it occurs, append a text input
     * that the user can edit and listen for keydown on the enter key. When enter is
     * pressed, processTextEvent is called, the input element is removed, and the text
     * is appended to the canvas.
     */
    var textEvent;
    var textInputId = 'textAnnotation';
    var ignoreClicks = false;
    var handleClick = function (event) {

      event.preventDefault();

      if (!self.selectedItem || self.selectedItem.id !== 'OT_text' || ignoreClicks) {
        return;
      }

      ignoreClicks = true;

      // Save raw events to reprocess on canvas resize
      event.selectedItem = self.selectedItem;

      createTextInput(event);

    };


    // Listen for keydown on 'Enter' once the text input is appended
    var handleKeyDown = function (event) {

      // Enter
      if (event.which === 13) {
        processTextEvent();
      }
      // Escape
      if (event.which === 27) {
        context.getElementById(textInputId).remove();
        textEvent = null;
      }

      ignoreClicks = false;

    };

    var addKeyDownListener = function () {
      context.addEventListener('keydown', handleKeyDown);
    };

    var removeKeyDownListener = function () {
      context.removeEventListener('keydown', handleKeyDown);
    };

    /**
     * Get the value of the text input and use it to create an "event".
     */
    var processTextEvent = function () {

      var textInput = context.getElementById(textInputId);
      var inputheight = textInput.clientHeight;

      if (!textInput.value) {
        textEvent = null;
        return;
      }

      textInput.remove();
      removeKeyDownListener();

      textEvent.text = textInput.value;
      textEvent.font = '16px Arial';
      textEvent.userColor = self.userColor;

      textEvent.canvas = {
        width: canvas.width,
        height: canvas.height,
        offsetLeft: canvas.offsetLeft,
        offsetTop: canvas.offsetTop
      }
      eventHistory.push(textEvent);
      updateCanvas(textEvent);
    };


    var createTextInput = function (event) {

      var textInput = context.createElement('input');

      textInput.setAttribute('type', 'text');
      textInput.style.position = 'absolute';
      textInput.style.top = event.clientY + 'px';
      textInput.style.left = event.clientX + 'px';
      textInput.style.background = 'rgba(255,255,255, .5)';
      textInput.style.width = '100px';
      textInput.style.maxWidth = '200px';
      textInput.style.border = '1px dashed red';
      textInput.style.fontSize = '16px';
      textInput.style.color = self.userColor;
      textInput.style.fontFamily = 'Arial';
      textInput.style.zIndex = '1001';
      textInput.setAttribute('data-canvas-origin', JSON.stringify({
        x: event.offsetX,
        y: event.offsetY
      }));
      textInput.id = textInputId;

      context.body.appendChild(textInput);
      textInput.focus();

      textEvent = event;
      textEvent.inputHeight = textInput.clientHeight;
      addKeyDownListener();

    };

    addEventListeners(canvas, 'click', handleClick);

    /**
     * End Handle text markup
     */

    var draw = function (update, resizeEvent) {

      if (!ctx) {
        ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.fillStyle = 'solid';
      }

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Repopulate the canvas with items from drawHistory
      drawHistory.forEach(function (history) {

        ctx.strokeStyle = history.color;
        ctx.lineWidth = history.lineWidth;

        // INFO iOS serializes bools as 0 or 1
        history.smoothed = !!history.smoothed;
        history.startPoint = !!history.startPoint;

        var secondPoint = false;
        var isText = !!history.selectedItem && history.selectedItem.title === 'Text' && history.text;

        if (isText) {
          ctx.font = history.font;
          ctx.fillStyle = history.color;
          ctx.fillText(history.text, history.fromX, history.fromY);

        } else {

          if (history.smoothed) {
            if (history.startPoint) {
              self.isStartPoint = true;
            } else {
              // If the start point flag was already set, we received the next point in the sequence
              if (self.isStartPoint) {
                secondPoint = true;
                self.isStartPoint = false;
              }
            }

            if (history.startPoint) {
              // Close the last path and create a new one
              ctx.closePath();
              ctx.beginPath();
            } else if (secondPoint) {
              ctx.moveTo((history.fromX + history.toX) / 2, (history.fromY + history.toY) / 2);
            } else {
              // console.log('Points: (' + (history.fromX + history.toX) / 2 + ', ' + (history.fromY + history.toY) / 2 + ')');
              // console.log('Control Points: (' + history.fromX + ', ' + history.fromY + ')');
              ctx.quadraticCurveTo(history.fromX, history.fromY, (history.fromX + history.toX) / 2, (history.fromY + history.toY) / 2);

              ctx.stroke();
            }
          } else {
            ctx.beginPath();
            ctx.moveTo(history.fromX, history.fromY);
            ctx.lineTo(history.toX, history.toY);
            ctx.stroke();
            ctx.closePath();
          }
        }

      });

      var selectedItem = !!resizeEvent ? update.selectedItem : self.selectedItem;

      if (selectedItem && (selectedItem.title === 'Pen' || selectedItem.title === 'Text')) {

        if (update) {

          if (selectedItem.title === 'Pen') {
            ctx.strokeStyle = update.color;
            ctx.lineWidth = update.lineWidth;
            ctx.beginPath();
            ctx.moveTo(update.fromX, update.fromY);
            ctx.lineTo(update.toX, update.toY);
            ctx.stroke();
            ctx.closePath();
          }

          if (selectedItem.title === 'Text') {
            ctx.font = update.font;
            ctx.fillStyle = update.color;
            ctx.fillText(update.text, update.fromX, update.fromY);
          }

          drawHistory.push(update);
        }
      } else {
        if (client.isDrawing) {
          if (update) {
            ctx.strokeStyle = update.color;
            ctx.lineWidth = update.lineWidth;
          }
          if (selectedItem && selectedItem.points) {
            drawPoints(ctx, self.selectedItem.points);
          }
        }
      }
    };

    var drawPoints = function (ctx, points) {
      var scale = scaleForPoints(points);

      ctx.beginPath();

      if (points.length === 2) {
        // We have a line
        ctx.moveTo(client.startX, client.startY);
        ctx.lineTo(client.mX, client.mY);
      } else {
        for (var i = 0; i < points.length; i++) {
          // Scale the points according to the difference between the start and end points
          var pointX = client.startX + (scale.x * points[i][0]);
          var pointY = client.startY + (scale.y * points[i][1]);

          if (self.selectedItem.enableSmoothing) {
            if (i === 0) {
              // Do nothing
            } else if (i === 1) {
              ctx.moveTo((pointX + client.lastX) / 2, (pointY + client.lastY) / 2);
              client.lastX = (pointX + client.lastX) / 2;
              client.lastX = (pointY + client.lastY) / 2;
            } else {
              ctx.quadraticCurveTo(client.lastX, client.lastY, (pointX + client.lastX) / 2, (pointY + client.lastY) / 2);
              client.lastX = (pointX + client.lastX) / 2;
              client.lastY = (pointY + client.lastY) / 2;
            }
          } else {
            if (i === 0) {
              ctx.moveTo(pointX, pointY);
            } else {
              ctx.lineTo(pointX, pointY);
            }
          }

          client.lastX = pointX;
          client.lastY = pointY;
        }
      }

      ctx.stroke();
      ctx.closePath();
    };

    var scaleForPoints = function (points) {
      // mX and mY refer to the end point of the enclosing rectangle (touch up)
      var minX = Number.MAX_VALUE;
      var minY = Number.MAX_VALUE;
      var maxX = 0;
      var maxY = 0;
      for (var i = 0; i < points.length; i++) {
        if (points[i][0] < minX) {
          minX = points[i][0];
        } else if (points[i][0] > maxX) {
          maxX = points[i][0];
        }

        if (points[i][1] < minY) {
          minY = points[i][1];
        } else if (points[i][1] > maxY) {
          maxY = points[i][1];
        }
      }
      var dx = Math.abs(maxX - minX);
      var dy = Math.abs(maxY - minY);

      var scaleX = (client.mX - client.startX) / dx;
      var scaleY = (client.mY - client.startY) / dy;

      return {
        x: scaleX,
        y: scaleY
      };
    };

    var drawIncoming = function (update, resizeEvent, index) {

      var iCanvas = {
        width: update.canvasWidth,
        height: update.canvasHeight
      };

      var iVideo = {
        width: update.videoWidth,
        height: update.videoHeight
      };

      var video = {
        width: self.videoFeed.videoElement().clientWidth,
        height: self.videoFeed.videoElement().clientHeight
      };

      var scale = 1;

      var canvasRatio = canvas.width / canvas.height;
      var videoRatio = video.width / video.height;
      var iCanvasRatio = iCanvas.width / iCanvas.height;
      var iVideoRatio = iVideo.width / iVideo.height;

      /**
       * This assumes that if the width is the greater value, video frames
       * can be scaled so that they have equal widths, which can be used to
       * find the offset in the y axis. Therefore, the offset on the x axis
       * will be 0. If the height is the greater value, the offset on the y
       * axis will be 0.
       */
      if (canvasRatio < 0) {
        scale = canvas.width / iCanvas.width;
      } else {
        scale = canvas.height / iCanvas.height;
      }

      var centerX = canvas.width / 2;
      var centerY = canvas.height / 2;

      var iCenterX = iCanvas.width / 2;
      var iCenterY = iCanvas.height / 2;

      update.fromX = centerX - (scale * (iCenterX - update.fromX));
      update.fromY = centerY - (scale * (iCenterY - update.fromY));

      update.toX = centerX - (scale * (iCenterX - update.toX));
      update.toY = centerY - (scale * (iCenterY - update.toY));

      // INFO iOS serializes bools as 0 or 1
      update.mirrored = !!update.mirrored;

      // Check if the incoming signal was mirrored
      if (update.mirrored) {
        update.fromX = canvas.width - update.fromX;
        update.toX = canvas.width - update.toX;
      }

      // Check to see if the active video feed is also mirrored (double negative)
      if (mirrored) {
        // Revert (Double negative)
        update.fromX = canvas.width - update.fromX;
        update.toX = canvas.width - update.toX;
      }


      /** Keep history of updates for resize */
      var updateForHistory = JSON.parse(JSON.stringify(update));
      updateForHistory.canvasWidth = canvas.width;
      updateForHistory.canvasHeight = canvas.height;
      updateForHistory.videoWidth = video.width;
      updateForHistory.videoHeight = video.height;

      if (resizeEvent) {
        updateHistory[index] = updateForHistory;
      } else {
        updateHistory.push(updateForHistory);
      }
      /** ********************************** */

      drawHistory.push(update);

      draw(null);
    };

    var drawUpdates = function (updates, resizeEvent) {

      updates.forEach(function (update, index) {
        if (self.videoFeed.stream && update.id === self.videoFeed.stream.connection.connectionId) {
          drawIncoming(update, resizeEvent, index);
        }
      });
    };

    var clearCanvas = function (incoming, cid) {
      // console.log('cid: ' + cid);
      // Remove all elements from history that were drawn by the sender

      drawHistory = drawHistory.filter(function (history) {
        return history.fromId !== cid;
      });

      if (!incoming) {
        if (self.session) {
          self.session.signal({
            type: 'otAnnotation_clear'
          });
        }
        eventHistory = [];
      } else {
        updateHistory = [];
      }



      // Refresh the canvas
      draw();
    };

    var undoLast = function (incoming, cid, itemsToRemove) {

      var historyItem;
      var removed;
      var endPoint = false;
      var removedItems = [];
      for (var i = drawHistory.length - 1; i >= 0; i--) {
        historyItem = drawHistory[i];
        if (historyItem.fromId === cid) {
          endPoint = endPoint || historyItem.endPoint;
          removed = drawHistory.splice(i, 1)[0];
          removedItems.push(removed.guid);
          if (!endPoint || (endPoint && removed.startPoint === true)) {
            break;
          }
        }
      }

      if (incoming) {
        updateHistory = updateHistory.filter(function (history) {
          return !itemsToRemove.includes(history.guid);
        });
      } else {
        eventHistory = eventHistory.filter(function (history) {
          return !removedItems.includes(history.guid);
        });

        self.session.signal({
          type: 'otAnnotation_undo',
          data: JSON.stringify(removedItems)
        });
      }

      draw();
    }


    var count = 0;
    /** Signal Handling **/
    if (self.videoFeed.session) {
      self.videoFeed.session.on({
        'signal:otAnnotation_pen': function (event) {
          if (event.from.connectionId !== self.session.connection.connectionId) {
            drawUpdates(JSON.parse(event.data));
          }
        },
        'signal:otAnnotation_text': function (event) {
          if (event.from.connectionId !== self.session.connection.connectionId) {
            drawUpdates(JSON.parse(event.data));
          }
        },
        'signal:otAnnotation_history': function (event) {
          // We will receive these from everyone in the room, only listen to the first
          // person. Also the data is chunked together so we need all of that person's
          if (!drawHistoryReceivedFrom || drawHistoryReceivedFrom === event.from.connectionId) {
            drawHistoryReceivedFrom = event.from.connectionId;
            drawUpdates(JSON.parse(event.data));
          }
        },
        'signal:otAnnotation_clear': function (event) {
          if (event.from.connectionId !== self.session.connection.connectionId) {
            // Only clear elements drawn by the sender's (from) Id
            clearCanvas(true, event.from.connectionId);
          }
        },
        'signal:otAnnotation_undo': function (event) {
          if (event.from.connectionId !== self.session.connection.connectionId) {
            // Only clear elements drawn by the sender's (from) Id
            undoLast(true, event.from.connectionId, JSON.parse(event.data));
          }
        },
        connectionCreated: function (event) {
          if (drawHistory.length > 0 && event.connection.connectionId !== self.session.connection.connectionId) {
            batchSignal('otWhiteboard_history', drawHistory, event.connection);
          }
        }
      });
    }

    var batchSignal = function (data, toConnection) {
      // We send data in small chunks so that they fit in a signal
      // Each packet is maximum ~250 chars, we can fit 8192/250 ~= 32 updates per signal
      var dataCopy = data.slice();
      var signalError = function (err) {
        if (err) {
          TB.error(err);
        }
      };

      var type = 'otAnnotation_pen';
      var updateType = function (chunk) {
        if (!chunk || !chunk[0] || !chunk[0].selectedItem || !chunk[0].selectedItem.id) {
          return;
        }
        var id = chunk[0].selectedItem.id;
        type = id === 'OT_text' ? 'otAnnotation_text' : 'otAnnotation_pen';
      };

      while (dataCopy.length) {
        var dataChunk = dataCopy.splice(0, Math.min(dataCopy.length, 32));
        updateType(dataChunk);
        var signal = {
          type: type,
          data: JSON.stringify(dataChunk)
        };
        if (toConnection) signal.to = toConnection;
        self.session.signal(signal, signalError);
      }
    };

    var updateTimeout;
    var sendUpdate = function (update) {
      if (self.session) {
        batchUpdates.push(update);
        if (!updateTimeout) {
          updateTimeout = setTimeout(function () {
            batchSignal(batchUpdates);
            batchUpdates = [];
            updateTimeout = null;
          }, 100);
        }
      }
    };
  };

  //--------------------------------------
  //  OPENTOK ANNOTATION TOOLBAR
  //--------------------------------------

  OTSolution.Annotations.Toolbar = function (options) {
    var self = this;
    var _toolbar = this;

    options || (options = {});

    if (!options.session) {
      throw new Error('OpenTok Annotation Widget requires an OpenTok session');
    } else {
      _session = options.session;
    }

    if (!_OTKAnalytics && !options.OTKAnalytics) {
      throw new Error('OpenTok Annotation Widget requires an OpenTok Solution');
    } else {
      _OTKAnalytics = _OTKAnalytics || options.OTKAnalytics;

    }

    if (!_otkanalytics) {
      _logAnalytics();
    }

    this.session = options.session;
    this.parent = options.container;
    this.externalWindow = options.externalWindow;
    // TODO Allow 'style' objects to be passed in for buttons, menu toolbar, etc?
    this.backgroundColor = options.backgroundColor || 'rgba(102, 102, 102, 0.90)';
    this.subpanelBackgroundColor = options.subpanelBackgroundColor || '#323232';

    var imageAssets = options.imageAssets || DEFAULT_ASSET_URL;

    var toolbarItems = [{
        id: 'OT_pen',
        title: 'Pen',
        icon: [imageAssets, 'annotation-pencil.png'].join(''),
        selectedIcon: [imageAssets, 'annotation-pencil.png'].join(''),
        items: { /* Built dynamically */ }
      }, {
        id: 'OT_colors',
        title: 'Colors',
        icon: '',
        items: { /* Built dynamically */ }
      }, {
        id: 'OT_shapes',
        title: 'Shapes',
        icon: [imageAssets, 'annotation-shapes.png'].join(''),
        items: [{
          id: 'OT_rect',
          title: 'Rectangle',
          icon: [imageAssets, 'annotation-rectangle.png'].join(''),
          points: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0] // Reconnect point
          ]
        },
        {
          id: 'OT_rect_fill',
          title: 'Rectangle-Fill',
          icon: [imageAssets, 'annotation-rectangle.png'].join(''),
          points: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0] // Reconnect point
          ]
        }, {
          id: 'OT_oval',
          title: 'Oval',
          icon: [imageAssets, 'annotation-oval.png'].join(''),
          enableSmoothing: true,
          points: [
            [0, 0.5],
            [0.5 + 0.5 * Math.cos(5 * Math.PI / 4), 0.5 + 0.5 * Math.sin(5 * Math.PI / 4)],
            [0.5, 0],
            [0.5 + 0.5 * Math.cos(7 * Math.PI / 4), 0.5 + 0.5 * Math.sin(7 * Math.PI / 4)],
            [1, 0.5],
            [0.5 + 0.5 * Math.cos(Math.PI / 4), 0.5 + 0.5 * Math.sin(Math.PI / 4)],
            [0.5, 1],
            [0.5 + 0.5 * Math.cos(3 * Math.PI / 4), 0.5 + 0.5 * Math.sin(3 * Math.PI / 4)],
            [0, 0.5],
            [0.5 + 0.5 * Math.cos(5 * Math.PI / 4), 0.5 + 0.5 * Math.sin(5 * Math.PI / 4)]
          ]
        }, {
          id: 'OT_oval_fill',
          title: 'Oval-Fill',
          icon: [imageAssets, 'annotation-oval-fill.png'].join(''),
          enableSmoothing: true,
          points: [
            [0, 0.5],
            [0.5 + 0.5 * Math.cos(5 * Math.PI / 4), 0.5 + 0.5 * Math.sin(5 * Math.PI / 4)],
            [0.5, 0],
            [0.5 + 0.5 * Math.cos(7 * Math.PI / 4), 0.5 + 0.5 * Math.sin(7 * Math.PI / 4)],
            [1, 0.5],
            [0.5 + 0.5 * Math.cos(Math.PI / 4), 0.5 + 0.5 * Math.sin(Math.PI / 4)],
            [0.5, 1],
            [0.5 + 0.5 * Math.cos(3 * Math.PI / 4), 0.5 + 0.5 * Math.sin(3 * Math.PI / 4)],
            [0, 0.5],
            [0.5 + 0.5 * Math.cos(5 * Math.PI / 4), 0.5 + 0.5 * Math.sin(5 * Math.PI / 4)]
          ]
        },{
          id: 'OT_star',
          title: 'Star',
          icon: [imageAssets, 'annotation-star.png'].join(''),
          points: [
            /* eslint-disable max-len */
            [0.5 + 0.5 * Math.cos(90 * (Math.PI / 180)), 0.5 + 0.5 * Math.sin(90 * (Math.PI / 180))],
            [0.5 + 0.25 * Math.cos(126 * (Math.PI / 180)), 0.5 + 0.25 * Math.sin(126 * (Math.PI / 180))],
            [0.5 + 0.5 * Math.cos(162 * (Math.PI / 180)), 0.5 + 0.5 * Math.sin(162 * (Math.PI / 180))],
            [0.5 + 0.25 * Math.cos(198 * (Math.PI / 180)), 0.5 + 0.25 * Math.sin(198 * (Math.PI / 180))],
            [0.5 + 0.5 * Math.cos(234 * (Math.PI / 180)), 0.5 + 0.5 * Math.sin(234 * (Math.PI / 180))],
            [0.5 + 0.25 * Math.cos(270 * (Math.PI / 180)), 0.5 + 0.25 * Math.sin(270 * (Math.PI / 180))],
            [0.5 + 0.5 * Math.cos(306 * (Math.PI / 180)), 0.5 + 0.5 * Math.sin(306 * (Math.PI / 180))],
            [0.5 + 0.25 * Math.cos(342 * (Math.PI / 180)), 0.5 + 0.25 * Math.sin(342 * (Math.PI / 180))],
            [0.5 + 0.5 * Math.cos(18 * (Math.PI / 180)), 0.5 + 0.5 * Math.sin(18 * (Math.PI / 180))],
            [0.5 + 0.25 * Math.cos(54 * (Math.PI / 180)), 0.5 + 0.25 * Math.sin(54 * (Math.PI / 180))],
            [0.5 + 0.5 * Math.cos(90 * (Math.PI / 180)), 0.5 + 0.5 * Math.sin(90 * (Math.PI / 180))]
            /* eslint-enable max-len */
          ]
        }, {
          id: 'OT_arrow',
          title: 'Arrow',
          icon: [imageAssets, 'annotation-arrow.png'].join(''),
          points: [
            [0, 1],
            [3, 1],
            [3, 0],
            [5, 2],
            [3, 4],
            [3, 3],
            [0, 3],
            [0, 1] // Reconnect point
          ]
        }, {
          id: 'OT_line',
          title: 'Line',
          icon: [imageAssets, 'annotation-line.png'].join(''),
          selectedIcon: [imageAssets, 'annotation-line.png'].join(''),
          points: [
            [0, 0],
            [0, 1]
          ]
        }]
      }, {
        id: 'OT_text',
        title: 'Text',
        icon: [imageAssets, 'annotation-text.png'].join(''),
        selectedIcon: [imageAssets, 'annotation-text.png'].join('')
      }, {
        id: 'OT_clear',
        title: 'Clear',
        icon: [imageAssets, 'annotation-clear.png'].join('')
      },
      {
        id: 'OT_undo',
        title: 'Undo',
        icon: [imageAssets, 'annotation-undo.png'].join('')
      }, {
        id: 'OT_capture',
        title: 'Capture',
        icon: [imageAssets, 'annotation-camera.png'].join(''),
        selectedIcon: [imageAssets, 'annotation-camera.png'].join('')
      }
    ];



    /**
     * If we recieve items as part of the options hash, build the toolbar from the list of items.
     * Otherwise, include all items.
     */
    var getItems = function () {
      var itemNames = ['pen', 'colors', 'shapes', 'text', 'clear', 'undo', 'capture'];
      var shapeNames = ['rectangle', 'rectangle-fill', 'oval', 'oval-fill', 'star', 'arrow', 'line'];
      var addItem = function (acc, item) {
        var index = itemNames.indexOf(item);
        if (index !== -1) {
          var toolbarItem = toolbarItems[index];
          if (toolbarItem.title === 'Shapes' && !!options.shapes) {
            var shapes = options.shapes.reduce(function(shapeAcc, shape) {
              var shapeIndex = shapeNames.indexOf(shape);
              return shapeIndex !== -1 ? shapeAcc.concat(toolbarItem.items[shapeIndex]) : shapeAcc;
            }, []);
            toolbarItem.items = shapes;
          }
          acc.push(toolbarItem);
        }
        return acc;
      }

      if (!!options.items && !!options.items.length) {
        var itemsToBuild = options.items[0] === '*' ? itemNames : options.items;
        return itemsToBuild.reduce(addItem, []);
      } else {
        return toolbarItems;
      }
    }

    this.items = getItems();

    this.colors = options.colors || [
      '#1abc9c',
      '#2ecc71',
      '#3498db',
      '#9b59b6',
      '#34495e',
      '#16a085',
      '#27ae60',
      '#2980b9',
      '#8e44ad',
      '#2c3e50',
      '#f1c40f',
      '#e67e22',
      '#e74c3c',
      '#ecf0f1',
      '#95a5a6',
      '#f39c12',
      '#d35400',
      '#c0392b',
      '#bdc3c7',
      '#7f8c8d'
    ];

    this.cbs = [];
    var canvases = [];

    /**
     * Creates a sub-menu with a color picker.
     *
     * @param {String|Element} parent The parent div container for the color picker sub-menu.
     * @param {Array} colors The array of colors to add to the palette.
     * @param {Object} options options An object containing the following fields:
     *
     *  - `openEvent` (String): The open event (default: `"click"`).
     *  - `style` (Object): Some style options:
     *    - `display` (String): The display value when the picker is opened (default: `"block"`).
     *  - `template` (String): The color item template. The `{color}` snippet will be replaced
     *    with the color value (default: `"<div data-col=\"{color}\" style=\"background-color: {color}\"></div>"`).
     *  - `autoclose` (Boolean): If `false`, the color picker will not be hidden by default (default: `true`).
     *
     * @constructor
     */
    var ColorPicker = function (parent, colors, options) {
      var self = this;
      var context = _toolbar.externalWindow ? _toolbar.externalWindow.document : document;

      this.getElm = function (el) {
        if (typeof el === 'string') {
          return context.querySelector(el);
        }
        return el;
      };

      this.render = function () {
        var self = this,
          html = '';

        self.colors.forEach(function (c) {
          html += self.options.template.replace(/\{color\}/g, c);
        });

        self.elm.innerHTML = html;
      };

      this.close = function () {
        // this.elm.style.display = 'none';
        this.elm.classList.add('ots-hidden');
      };

      this.open = function () {
        // this.elm.style.display = this.options.style.display;
        this.elm.classList.remove('ots-hidden')

      };

      this.colorChosen = function (cb) {
        this.cbs.push(cb);
      };

      this.set = function (c, p) {
        var self = this;
        self.color = c;
        if (p === false) {
          return;
        }
        self.cbs.forEach(function (cb) {
          cb.call(self, c);
        });
      };

      options = options || {};
      options.openEvent = options.openEvent || 'click';
      options.style = Object(options.style);
      // options.style.display = options.style.display || 'block';
      options.template = options.template || '<div class=\"color-choice\" data-col=\"{color}\" style=\"background-color: {color}\"></div>';
      self.elm = self.getElm(parent);
      self.cbs = [];
      self.colors = colors;
      self.options = options;
      self.render();

      // Click on colors
      self.elm.addEventListener('click', function (ev) {
        var color = ev.target.getAttribute('data-col');
        if (!color) {
          return;
        }
        var colors = Array.from(document.getElementsByClassName('color-choice'));
        colors.forEach(function (el) {
          el.classList.remove('active');
        });
        ev.target.classList.add('active');
        self.set(color);
        self.close();
      });

      if (options.autoclose !== false) {
        self.close();
      }
    };

    var panel;
    this.createPanel = function (externalWindow) {
      if (_toolbar.parent) {
        var context = externalWindow ? externalWindow.document : document;
        panel = context.createElement('div');
        panel.setAttribute('id', 'OT_toolbar');
        panel.setAttribute('class', 'OT_panel');
        panel.style.width = '100%';
        panel.style.height = '100%';
        this.parent.appendChild(panel);
        this.parent.style.position = 'relative';
        this.parent.zIndex = 1000;

        var toolbarItems = [];
        var subPanel = context.createElement('div');

        for (var i = 0, total = this.items.length; i < total; i++) {
          var item = this.items[i];

          var button = context.createElement('input');
          button.setAttribute('type', 'button');
          button.setAttribute('id', item.id);
          button.classList.add('annotation-btn');
          button.classList.add(item.title.split(' ').join('-').toLowerCase());

          if (item.id === 'OT_colors') {

            var colorPicker = context.createElement('div');
            colorPicker.setAttribute('class', 'color-picker');
            // colorPicker.style.backgroundColor = this.subpanelBackgroundColor;
            this.parent.appendChild(colorPicker);

            var pk = new ColorPicker('.color-picker', this.colors, {
              externalWindow: _toolbar.externalWindow
            });

            pk.colorChosen(function (color) {
              var colorGroup = context.getElementById('OT_colors');
              colorGroup.style.backgroundColor = color;

              canvases.forEach(function (canvas) {
                canvas.changeColor(color);
              });
            });

            var colorChoices = context.querySelectorAll('.color-choice');
            colorChoices[0].classList.add('active');
            button.setAttribute('class', 'OT_color annotation-btn colors');
            button.style.borderRadius = '50%';
            button.style.backgroundColor = this.colors[0];

          }

            if (item.title === 'Pen' && !Array.isArray(item.items)) {
            // Add defaults
            item.items = [{
              id: 'OT_line_width_2',
              title: 'Line Width 2',
              size: 2
            }, {
              id: 'OT_line_width_4',
              title: 'Line Width 4',
              size: 4
            }, {
              id: 'OT_line_width_6',
              title: 'Line Width 6',
              size: 6
            }, {
              id: 'OT_line_width_8',
              title: 'Line Width 8',
              size: 8
            }, {
              id: 'OT_line_width_10',
              title: 'Line Width 10',
              size: 10
            }, {
              id: 'OT_line_width_12',
              title: 'Line Width 12',
              size: 12
            }, {
              id: 'OT_line_width_14',
              title: 'Line Width 14',
              size: 14
            }];
          }

          if (item.items) {
            // Indicate that we have a group
            button.setAttribute('data-type', 'group');
          }

          button.setAttribute('data-col', item.title);


          toolbarItems.push(button.outerHTML);
        }

        panel.innerHTML = toolbarItems.join('');

        panel.onclick = function (ev) {
          var group = ev.target.getAttribute('data-type') === 'group';
          var itemName = ev.target.getAttribute('data-col');
          var id = ev.target.getAttribute('id');


          // Close the submenu if we are clicking on an item and not a group button
          if (!group) {
            self.items.forEach(function (item) {
              if ((item.title !== 'Clear' || item.title !== 'Undo') && item.title === itemName) {

                self.selectedItem = item;

                attachDefaultAction(item);

                canvases.forEach(function (canvas) {
                  canvas.selectItem(self.selectedItem);
                });

                return false;
              }
            });
            subPanel.classList.add('ots-hidden')
          } else {
            self.items.forEach(function (item) {
              if (item.title === itemName) {
                self.selectedGroup = item;

                if (item.items) {
                  subPanel.setAttribute('class', ['OT_subpanel', 'ots-hidden', item.title.toLowerCase()].join(' '));

                  self.parent.appendChild(subPanel);

                  if (Array.isArray(item.items)) {
                    var submenuItems = [];

                    if (item.id === 'OT_pen') {
                      // We want to dynamically create icons for the list of possible line widths
                      item.items.forEach(function (subItem) {
                        // INFO Using a div here - not input to create an inner div representing the line width - better option?
                        var itemButton = context.createElement('div');
                        itemButton.setAttribute('data-col', subItem.title);
                        itemButton.setAttribute('class', ['line-width-option', subItem.size].join(' '));
                        itemButton.setAttribute('id', subItem.id);

                        var lineIcon = context.createElement('div');
                        lineIcon.setAttribute('class', 'line-width-icon')
                        // TODO Allow devs to change this?
                        lineIcon.style.backgroundColor = '#FFFFFF';
                        lineIcon.style.width = '80%';
                        lineIcon.style.height = subItem.size + 'px';
                        lineIcon.style.position = 'relative';
                        lineIcon.style.left = '50%';
                        lineIcon.style.top = '50%';
                        lineIcon.style.transform = 'translateX(-50%) translateY(-50%)';
                        // Prevents div icon from catching events so they can be passed to the parent
                        lineIcon.style.pointerEvents = 'none';

                        itemButton.appendChild(lineIcon);

                        submenuItems.push(itemButton.outerHTML);
                      });
                    } else {
                      item.items.forEach(function (subItem) {
                        var itemButton = context.createElement('input');
                        itemButton.setAttribute('type', 'button');
                        itemButton.setAttribute('data-col', subItem.title);
                        itemButton.setAttribute('id', subItem.id);
                        itemButton.setAttribute('class', ['annotation-btn', subItem.title.toLowerCase()].join(' '));
                        // itemButton.style.backgroundImage = 'url("' + subItem.icon + '")';
                        // itemButton.style.position = 'relative';
                        // itemButton.style.top = '50%';
                        // itemButton.style.transform = 'translateY(-50%)';
                        // itemButton.style.backgroundSize = self.iconWidth + ' ' + self.iconHeight;
                        // itemButton.style.backgroundPosition = 'center';
                        // itemButton.style.width = self.buttonWidth;
                        // itemButton.style.height = self.buttonHeight;
                        // itemButton.style.border = 'none';
                        // itemButton.style.cursor = 'pointer';

                        submenuItems.push(itemButton.outerHTML);
                      });
                    }

                    subPanel.innerHTML = submenuItems.join('');
                  }
                }

                if (id === 'OT_shapes' || id === 'OT_pen') {
                  if (subPanel) {
                    subPanel.classList.remove('ots-hidden');
                  }
                  pk.close();
                } else if (id === 'OT_colors') {
                  if (subPanel) {
                    subPanel.classList.add('ots-hidden');
                  }
                  pk.open();
                }
              }
            });
          }

          self.cbs.forEach(function (cb) {
            cb.call(self, id);
          });
        };

        subPanel.onclick = function (ev) {
          var group = ev.target.getAttribute('data-type') === 'group';
          var itemName = ev.target.getAttribute('data-col');
          var id = ev.target.getAttribute('id');


          if (!!id && id.replace(/[^a-z]/g, '') === 'linewidth') {
            canvases.forEach(function (canvas) {
              canvas.selectItem(self.selectedGroup);
            });
          }

          subPanel.classList.add('ots-hidden');

          if (!group) {
            self.selectedGroup.items.forEach(function (item) {
              if (item.id !== 'OT_clear' && item.id === id) {
                if (self.selectedItem) {
                  var lastBtn = document.getElementById(self.selectedItem.id);
                  if (lastBtn) {
                    // lastBtn.style.background = 'url("' + self.selectedItem.icon + '") no-repeat';
                    // lastBtn.style.backgroundSize = self.iconWidth + ' ' + self.iconHeight;
                    // lastBtn.style.backgroundPosition = 'center';
                  }
                }

                if (item.selectedIcon) {
                  var selBtn = document.getElementById(item.id);
                  if (lastBtn) {
                    selBtn.style.background = 'url("' + item.selectedIcon + '") no-repeat';
                    selBtn.style.backgroundSize = self.iconWidth + ' ' + self.iconHeight;
                    selBtn.style.backgroundPosition = 'center';
                  }
                }

                self.selectedItem = item;

                attachDefaultAction(item);

                canvases.forEach(function (canvas) {
                  canvas.selectItem(self.selectedItem);
                });

                return false;
              }
            });
          }

          self.cbs.forEach(function (cb) {
            cb.call(self, id);
          });
        };

        context.getElementById('OT_clear').onclick = function () {
          canvases.forEach(function (canvas) {
            canvas.clear();
          });
        };

        context.getElementById('OT_undo').onclick = function () {
          canvases.forEach(function (canvas) {
            canvas.undo();
          });
        };
      }
    };

    !this.externalWindow && this.createPanel();

    var attachDefaultAction = function (item) {
      if (!item.points) {
        // Attach default actions
        if (item.id === 'OT_line') {
          self.selectedItem.points = [
            [0, 0],
            [0, 1]
          ];
        } else if (item.id === 'OT_arrow') {
          self.selectedItem.points = [
            [0, 1],
            [3, 1],
            [3, 0],
            [5, 2],
            [3, 4],
            [3, 3],
            [0, 3],
            [0, 1] // Reconnect point
          ];
        } else if (item.id === 'OT_rect') {
          self.selectedItem.points = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0] // Reconnect point
          ];
        } else if (item.id === 'OT_oval') {
          self.selectedItem.enableSmoothing = true;
          self.selectedItem.points = [
            [0, 0.5],
            [0.5 + 0.5 * Math.cos(5 * Math.PI / 4), 0.5 + 0.5 * Math.sin(5 * Math.PI / 4)],
            [0.5, 0],
            [0.5 + 0.5 * Math.cos(7 * Math.PI / 4), 0.5 + 0.5 * Math.sin(7 * Math.PI / 4)],
            [1, 0.5],
            [0.5 + 0.5 * Math.cos(Math.PI / 4), 0.5 + 0.5 * Math.sin(Math.PI / 4)],
            [0.5, 1],
            [0.5 + 0.5 * Math.cos(3 * Math.PI / 4), 0.5 + 0.5 * Math.sin(3 * Math.PI / 4)],
            [0, 0.5],
            [0.5 + 0.5 * Math.cos(5 * Math.PI / 4), 0.5 + 0.5 * Math.sin(5 * Math.PI / 4)]
          ];
        }
      }
    };

    /**
     * Callback function for toolbar menu item click events.
     * @param cb The callback function used to handle the click event.
     */
    this.itemClicked = function (cb) {
      this.cbs.push(cb);
    };

    /**
     * Links an annotation canvas to the toolbar so that menu actions can be handled on it.
     * @param canvas The annotation canvas to be linked to the toolbar.
     */
    this.addCanvas = function (canvas) {
      var self = this;
      canvas.link(self.session);
      canvas.colors(self.colors);
      canvases.push(canvas);
      canvases.forEach(function(canvas) {
        canvas.selectedItem = canvas.selectedItem || self.items[0];
      });
    };

    /**
     * Removes the annotation canvas with the specified connectionId from its parent container and
     * unlinks it from the toolbar.
     * @param connectionId The stream's connection ID for the video feed whose canvas should be removed.
     */
    this.removeCanvas = function (connectionId) {
      canvases.forEach(function (annotationView) {
        var canvas = annotationView.canvas();
        if (annotationView.videoFeed.stream.connection.connectionId === connectionId) {
          if (canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
          }
        }
      });

      canvases = canvases.filter(function (annotationView) {
        return annotationView.videoFeed.stream.connection.connectionId !== connectionId;
      });
    };

    /**
     * Removes the toolbar and all associated annotation canvases from their parent containers.
     */
    this.remove = function () {

      try {
        panel.parentNode.removeChild(panel);
      } catch (e) {
        console.log(e);
      }

      canvases.forEach(function (annotationView) {
        var canvas = annotationView.canvas();
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
      });

      canvases = [];
    };
  };

}.call(this));