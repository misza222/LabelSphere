/*
 *  LabelSphere.js - Displays Blogger labels in a rotating sphere shape.
 *  Copyright (C) 2010, 2011  Alex Dioso (alex.dioso@ikaika.org)
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/*
 * Only works in a Blogger gadget (xml).
 * Requires Google Libraries API to be loaded before this script
 * http://code.google.com/apis/libraries/devguide.html
 * Then this script should be loaded with
 * gadgets.util.registerOnLoadHandler(function(){ikaika(__MODULE_ID__)});
 */
ikaika = function(moduleId) {

    // Provide variables for commonly used things so they can be optimized by
    // the closure compiler
    var mSqrt = Math['sqrt'];
    var mSin = Math['sin'];
    var mCos = Math['cos'];
    var prefs = new gadgets['Prefs']();
    var css = 'css';
    var hover = 'hover';
    var animate = 'animate';
    var w = 'width';
    var h = 'height';
    var attr = 'attr';

    // Variables needed by multiple functions
    var container;                  // Div containing the labels
    var size;                       // Smallest dimension of the container
    var numLabels = 0;              // Total number of labels found
    var labels = new Object();      // Hash of labels
    var radius;                     // TODO
    var moveSphereTimer;            // TODO
    var clearMoveSphereTimer = 0;   // If the time should be stopped
    var angle;                      // TODO
    var axis = new Object();        // TODO

    // Supported skin properties
    // http://code.google.com/apis/blogger/docs/gadgets/gadgets_for_blogger.html#BestUIPractices
    var gSkinsGetProp = gadgets['skins']['getProperty'];
    var fontFace = gSkinsGetProp('FONT_FACE');

    // Status messages
    var msg = new gadgets['MiniMessage'](moduleId);

    // If the gadget is not being used on Blogger
    if (!google['hasOwnProperty']('Blog')){
        var notBloggerMessage =
            msg['createStaticMessage']("Label Sphere only works in Blogger");
        return;
    }

    // Display a loading status message to let the user know something is
    // happening
    var loadMessage = msg['createStaticMessage']("Loading...");

    // Get the number of labels specified in the gadget options
    var maxLabels = parseInt(prefs['getString']("maxLabels"), 10);
    if (isNaN(maxLabels)){
        // Default to 20 labels
        maxLabels = 20;
    }

    // Load jquery and then finish initializing
    google['load']('jquery', '1');
    google['setOnLoadCallback'](init);

    /*
     * Performs all the setup for the gadget, gets list of labels from the
     * blog's feed, arranges them around a sphere, and sets event handlers to
     * rotate the sphere based on mouse position.
     */
    function init() {

        // Get the div that will contain the labels
        container = $('#ikaika-container');

        // Set some CSS properties to match the blog
        $('*')[css]({
            backgroundColor: gSkinsGetProp('CONTENT_BG_COLOR'),
            color: '#8D1820',
            fontFamily: fontFace
        });

        $(container)[css]({
            borderColor: gSkinsGetProp('BORDER_COLOR')
        });

        var blog = new google['Blog'](function() {
            blog['getPostsJson'](onLoadPosts);
        }, window['name']);
    }

    /*
     * When the posts are loaded, create the sphere of labels
     */
    function onLoadPosts(data) {

        // Display an error message if this is a private blog
        if (data['text'] ==
                "User does not have permission to read this blog.") {
            errorMessage("This gadget only works on public blogs");
            return;
        }

        // Find the url for the site
        var blogUrl = getBlogUrl(data);
        if (typeof blogUrl == "undefined") {
            errorMessage("Error getting Website URL");
            return;
        }

        createLabels(data, blogUrl);

        if (!numLabels) {
            errorMessage("No Labels");
            return;
        }

        createSphere();

        msg['dismissMessage'](loadMessage);

        setupMouseMove();
        setupMouseHover();
    }

    function errorMessage(txt) {
        msg['dismissMessage'](loadMessage);
        var errorMsg = msg['createStaticMessage'](txt);
    }

    function getBlogUrl(data) {
        var link = data['data']['feed']['link'];
        for (var i in link){
            if (link[i]['rel'] == 'alternate'){
                return link[i]['href'];
            }
        }
        return undefined;
    }

    /*
     * Create the label elements in html and set some basic css. IE does not
     * allow javascript to set the color of links. This creates a div with
     * the label as text, then a child div with the actual link. The div
     * containing the link is set transparent. The div with the text is given
     * the blog's link color.
     */
    function createLabels(data, blogUrl) {
        var entry = data['data']['feed']['entry'];
        // For every blog entry
        for (var i in entry) {
            var cat = entry[i]['category'];
            // For every category that the entry is tagged as
            for (var a in cat) {
                if (numLabels >= maxLabels){
                    break;
                }
                var label = cat[a]['term'];
                if (labels['hasOwnProperty'](label)){
                    // Label has already been added, continue to next label
                    labels[label].num++;
                    continue;
                }

                $(container)['append'](
                    '<div id="'+label+'" class="ikaikaLabel" '+
                            'style="position:absolute;border-width:1">'+
                        '<a href="'+blogUrl+'search/label/'+label+
                                '" target="_parent">'+
                            label+
                        '</a>'+
                    '</div>');
                labels[label] = new Object();
                labels[label].num = 1;
                numLabels++;
            }
        }

        $('a')[css]({
            color: '#8D1820',
            textDecoration: 'none'
        });

        $('.ikaikaLabel')[hover](
            function() {$(this)[css]({fontWeight: 'bold'});},
            function() {$(this)[css]({fontWeight: 'normal'});}
        );
    }

    /*
     * Distribute the labels around the sphere
     */
    function createSphere() {
        // Find the smaller dimension
        if ($(container)[w] > $(container)[h]) {
            size = $(container)[h]();
        } else {
            size = $(container)[w]();
        }

        // Use the smaller dimension as a basis for the sphere's radius
        radius = size * 3 / 11;

        // New size to use for movement calculations
        size = size / 2 - 1;

        var increment = Math['PI'] * (3 - mSqrt(5));
        var offset = 2 / numLabels;

        // Calculate points around the sphere for each label
        $('.ikaikaLabel')['each'](function(i, value){
            var label = $(value)[attr]('id');
            labels[label].e = value; // Save the label's id for later use
            labels[label].y = i * offset - 1 + (offset / 2);
            var r = mSqrt(1 - labels[label].y*labels[label].y);
            var phi = i * increment;
            labels[label].x = mCos(phi)*r;
            labels[label].z = mSin(phi)*r;
            placeLabel(labels[label], 0, 0);
        });
    }

    /*
     * Plae the label on the screen based on its sphere coordinates
     */
    function placeLabel(label) {
        // Convert to screen coordinates
        var y = (label.y * radius) + size;
        var z = (label.z * radius) + size;
        var x = (label.x * radius);
        var f_size = ((label.x + 1)/4*100) + 50;
        var opacity = f_size/100;

        // Modify the size of the label
        $(label.e)[css]({fontSize: f_size + '%'});

        // Adjust the screen position based on the new size
        y -= $(label.e)[w]()/2;
        z -= $(label.e)[h]()/2;
        $(label.e)[css]({
            bottom: z,
            right: y,
            zIndex: Math.round(x)
        });
        $(label.e)['fadeTo'](0,opacity);
    }

    /*
     * When the mouse is over the container, determine the axis to rotate
     * around and the angle (speed) to rotate the sphere
     */
    function setupMouseMove() {
        $(container)['mousemove'](function(e){
            var offset = $(container)['offset']();
            var mouse_y = (e['pageX'] - offset['left']) - size;
            var mouse_z = size - (e['pageY'] - offset['top']);
            var mouse_l = mSqrt(mouse_y * mouse_y + mouse_z * mouse_z);
            angle = Math['atan2'](mouse_l, radius)/15;
            axis.x = 0;
            axis.y = (mouse_z)/mouse_l;
            axis.z = mouse_y/mouse_l;
        });
    }

    /*
     * When the mouse moves into the container, set up a timer callback to
     * move the sphere. When the mouse moves out, set a value to signal the
     * callback to slow down and eventually stop.
     */
    function setupMouseHover() {
        $(container)[hover](
            function(){
                clearMoveSphereTimer = 0;
                moveSphereTimer = setTimeout(moveSphere, 33);
            },
            function(){
                clearMoveSphereTimer = 1;
            }
        );
    }

    /*
     * Calculate each label's new screen coordinates based on the angle of
     * the axis and the angle of rotation (speed).
     */
    function moveSphere(){
        var cos_angle = mCos(angle);
        var one_cos_angle = 1 - cos_angle;
        var sin_angle = mSin(angle);
        for (var i in labels) {
            // Change the labels position
            var obj_rot = new Object();

            var axis_x_obj = new Object();
            axis_x_obj.x = (axis.y * labels[i].z) - (axis.z * labels[i].y);
            axis_x_obj.y = (axis.z * labels[i].x) - (axis.x * labels[i].z);
            axis_x_obj.z = (axis.x * labels[i].y) - (axis.y * labels[i].x);

            var axis_d_obj = (axis.x * labels[i].x) + (axis.y * labels[i].y) +
                (axis.z * labels[i].z);

            // New x
            obj_rot.x = (labels[i].x * cos_angle);
            obj_rot.x += (axis_x_obj.x * sin_angle);
            obj_rot.x += (axis.x * axis_d_obj * one_cos_angle);

            // New y
            obj_rot.y = (labels[i].y * cos_angle);
            obj_rot.y += (axis_x_obj.y * sin_angle);
            obj_rot.y += (axis.y * axis_d_obj * one_cos_angle);

            // New z
            obj_rot.z = (labels[i].z * cos_angle);
            obj_rot.z += (axis_x_obj.z * sin_angle);
            obj_rot.z += (axis.z * axis_d_obj * one_cos_angle);

            labels[i].x = obj_rot.x;
            labels[i].y = obj_rot.y;
            labels[i].z = obj_rot.z;

            placeLabel(labels[i]);
        }

        // If the mouse is no longer in the container, slow the sphere down
        if (clearMoveSphereTimer) {
            angle -= angle/20;
            // Stop the sphere after it is slower than a certain speed
            if (angle < 0.01) {
                clearMoveSphereTimer = 0;
                clearTimeout(moveSphereTimer);
            } else {
                moveSphereTimer = setTimeout(moveSphere, 33);
            }
        } else {
            moveSphereTimer = setTimeout(moveSphere, 33);
        }
    }
};
