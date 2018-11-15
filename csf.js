// Copyright (c) 2014-2018 Anthony Carapetis
// This software is licensed under the MIT license.
// See COPYING for more details.

import {flowArray} from './flow.js';
import {renderClosedCurve, renderPath} from './graphics.js';

// {{{ Setup
var canvas = document.querySelector('canvas');
canvas.onselectstart = function() {return false;};
var ctx = canvas.getContext('2d');
var raw_mouse = {x:0, y:0};
var ticks = 0;
var seglength = 5;
var debug = function() { return /debug/.test(window.location.hash); };
var drawing = false;
var fresh_curve = [];
var curves = [];
var dt = 1;

const toPairs = a => a.map(({x,y}) => [x,y]);
const fromPairs = a => a.map(([x,y]) => ({x,y}));

ctx.fillCircle = function(x,y,r) {
    this.beginPath();
    this.arc(x,y,r,0,2*Math.PI);
    this.closePath();
    this.fill();
};

var resize = function() {
    // Make sure 1 canvas pixel = 1 screen pixel
    var dpr = window.devicePixelRatio || 1;
    var bsr = ctx.webkitBackingStorePixelRatio 
          ||  ctx.mozBackingStorePixelRatio
          ||  ctx.msBackingStorePixelRatio
          ||  ctx.oBackingStorePixelRatio
          ||  ctx.backingStorePixelRatio || 1;
    var PIXEL_RATIO = dpr/bsr;

    canvas.width    = canvas.clientWidth * PIXEL_RATIO;
    canvas.height   = canvas.clientHeight * PIXEL_RATIO;

    // If you have super high dpi then 1. you don't need as many 
    // segments/pixel and 2. you're probably running this on a moderately
    // slow ass-phone.
    seglength = 5 * PIXEL_RATIO;
};
// }}}

// {{{ point distance functions for convenience
var d2 = function(a,b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx*dx+dy*dy;
};

var len2 = function(a) { return d2(a,{x:0,y:0}); };
// }}}
  
// {{{ Input Handling
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

var mousemove = function(evt) {
    var rect = canvas.getBoundingClientRect();
    raw_mouse = {
        x: (evt.clientX-rect.left)/(rect.right-rect.left)*canvas.width,
        y: (evt.clientY-rect.top)/(rect.bottom-rect.top)*canvas.height
    };
    if (drawing && d2(raw_mouse,fresh_curve[fresh_curve.length - 1]) > seglength*seglength) fresh_curve.push(raw_mouse);
};

canvas.addEventListener('mousemove', mousemove);
canvas.addEventListener('touchmove', function(e) { 
    mousemove(e.originalEvent.changedTouches[0]); 
    return false;
});

var mousedown = function(e) {
    if (('button' in e) && e.button > 0) return;
    mousemove(e);
    drawing = true;
    fresh_curve = [raw_mouse];
    return false;
};

canvas.addEventListener('touchstart', function(e) {
    mousedown(e.originalEvent.changedTouches[0]); 
    return false;
});
canvas.addEventListener('mousedown', mousedown);

function mouseup(e) {
    if (!drawing) return;
    if (('button' in e) && e.button > 0) return;
    drawing = false;
    var p = fresh_curve[0];
    while(d2(p,fresh_curve[fresh_curve.length-1]) > seglength*seglength) {
        var q = fresh_curve[fresh_curve.length-1];
        var d = { x: p.x - q.x, y: p.y - q.y };
        var l = Math.pow(len2(d),1/2);
        fresh_curve.push({
            x: q.x + d.x * seglength / l,
            y: q.y + d.y * seglength / l
        });
    }
    curves.push(fresh_curve);
}
canvas.addEventListener('mouseup', mouseup);
canvas.addEventListener('touchend', mouseup);

// }}}

// {{{ The "one giant function" design pattern
var tick = function() {
    ticks++;

    if (ticks == 1) { // first tick
        // Generate an interesting demo curve to start.
        var N = 200;
        var curve = [];
        for (var i = 0; i < N; i++) {
            var x = canvas.width/2 + canvas.width*(0.05 * Math.cos(2*Math.PI*i/N));
            curve.push({
                x: x + 0.2*canvas.width*Math.pow(Math.cos(2*Math.PI*i/N),101),
                y: canvas.height * (0.15 + 0.05 * Math.sin(2*Math.PI*i/N) + 0.05*Math.sin(x/5) + 0.7 * Math.pow(Math.sin(2*Math.PI*i/N), 150))
            });
        }
        curves.push(curve);
    }
    
    // Clear screen and draw text
    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle = 'black';
    ctx.textAlign  = 'center';
    ctx.textBaseline='top';
    if (curves.length == 0 && !drawing) {
        ctx.font = '40px Computer Modern Serif';
        ctx.fillText('Draw a closed curve',canvas.width/2, 10);
    }
    if (debug()) {
        ctx.font = '30px monospace';
        ctx.fillText('canvas space = (' + canvas.width + ',' + canvas.height + ')',canvas.width/2, 80);
        ctx.fillText('<canvas> dims= (' + $(canvas).width() + ',' + $(canvas).height() + ')',canvas.width/2, 120);
    }

    // If user is currently drawing a curve, show it in grey.
    ctx.fillStyle = 'darkgrey';
    if (drawing) renderPath(toPairs(fresh_curve), ctx, 0.25);
    ctx.fillStyle = 'black';

    for (var j = 0; j < curves.length; j++) {
        if (curves[j].length < 5) curves.splice(j,1); // If curve has less than 5 vertices, destroy it.
        if (j == curves.length) break;
        var cu = curves[j];

        // Remove any vertices with infinite coordinates
        for (var i = 0; i < cu.length; i++) {
            var a = cu[i];
            if (!(isFinite(a.x) && isFinite(a.y))) {
                cu.splice(i--,1);
            }
        }

        // Remesh: Redivide curve to keep nodes evenly distributed
        for (var i = 0; i < cu.length; i++) {
            var a = cu[i];
            var bi = (i < cu.length - 1 ? i+1 : 0), b = cu[bi];

            var dx = b.x - a.x;
            var dy = b.y - a.y;

            var dr2 = dx*dx + dy*dy;
            if (dr2 > 4*seglength*seglength) {
                // If vertices are too far apart, add a new vertex in between
                var dr = Math.pow(dr2, 1/2);
                cu.splice(1+i,0,{
                    x: a.x + seglength * dx/dr,
                    y: a.y + seglength * dy/dr
                });
            }

            else if (cu.length > 4 && dr2 * 4 < seglength * seglength) {
                // If vertices are too close, remove one of them
                cu.splice(i--,1);
            }
        }

        // Compute maximum curvature and remove any discrete cusps (i.e. consecutive vertices a b c with a=c)
        var maxkappa = 0;
        var mean = {x:0, y:0};
        for (var i = 0; i < cu.length; i++) {
            var a  = cu[i];
            var bi = (i < cu.length - 1 ? i+1 : 0),              b = cu[bi];
            var ci = (i < cu.length - 2 ? i+2 : i+2-cu.length),  c = cu[ci];

            var dx = b.dx = 0.5*(c.x - a.x);
            var dy = b.dy = 0.5*(c.y - a.y);
            var ddx = b.ddx = c.x - 2*b.x + a.x;
            var ddy = b.ddy = c.y - 2*b.y + a.y;

            var dr2 = b.dr2 = dx*dx + dy*dy;

            if (dr2 == 0) { 
                // We have a double-back, remove it and continue
                cu.splice(i--,2);
                continue;
            }

            var kappa = b.kappa = (dx * ddy - dy * ddx)/Math.pow(dr2,3/2);

            if (Math.abs(kappa) > maxkappa) maxkappa = Math.abs(kappa);

            mean.x += b.x;
            mean.y += b.y;
        }

        mean.x /= cu.length;
        mean.y /= cu.length;

        // Flow
        cu = curves[j] = fromPairs(
            flowArray(toPairs(cu),dt/maxkappa)
        );

        renderClosedCurve(new CircularList(toPairs(cu)),ctx);

        // Destroy curve if it is too small or curvature is too extreme
        if (maxkappa > 5000 || curves[j].length < 5) curves.splice(j--,1);
    }
};
// }}}

// {{{ bombs away
window.addEventListener('load',function() {
    resize();
    setInterval(tick, 15);
    MathJax.Hub.Queue(resize);
});
// }}}
