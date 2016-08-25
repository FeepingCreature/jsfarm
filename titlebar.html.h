<nav class="navbar navbar-default navbar-static-top">
  <div class="container" style="margin-top: 0px; margin-bottom: 0px;">
    <div class="navbar-collapse collapse">
      <ul class="nav navbar-nav">
#if ACTIVE_PAGE != 0
	<li>
#else
	<li class="active">
#endif
	<a href="info.html">Introduction</a>
	</li>
#if ACTIVE_PAGE != 1
	<li>
#else
	<li class="active">
#endif
	<a href="tut1.html">Tutorial</a>
	</li>
#if ACTIVE_PAGE != 2
	<li>
#else
	<li class="active">
#endif
	<a href=".">Main Page</a>
	</li>
      </ul>
    </div>
  </div>
</nav>
