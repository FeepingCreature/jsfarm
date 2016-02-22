function time() { return (new Date()).getTime(); }

/** @constructor */
function TimeoutTimer(timeout_delta, onTimeout) {
  var t = time();
  this.last_checked = t;
  this.sleep_until = t + timeout_delta;
  this.timeout_fn = onTimeout;
  this.timeout_id = null;
  // wake up, check if we're past the timeout, go back to sleep
  this.run = function() {
    var t = time();
    this.timeout_id = null; // fulfilled
    if (t > this.sleep_until) {
      this.timeout_fn();
      return;
    }
    var delta = this.sleep_until - t;
    this.timeout_id = setTimeout(this.run.bind(this), delta);
  };
  // reset the timeout
  // call this when data is received
  this.reset = function() {
    var t = time();
    this.sleep_until = t + timeout_delta;
  };
  // cancel the timeout
  this.kill = function() {
    if (this.hasOwnProperty("timeout_id") && this.timeout_id) {
      clearTimeout(this.timeout_id);
    }
  };
  this.run();
}
