/* Copyright 2019 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the 'License');
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an 'AS IS' BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
/* Defines classes for managing the collection of lines in the parallel
   coordinates plot.
 */
var tf;
(function (tf) {
    var hparams;
    (function (hparams) {
        var parallel_coords_plot;
        (function (parallel_coords_plot) {
            /**
             * Represents the line 'type'. Either a foreground or a background line.
             * Each session group is drawn as two identical piecewise linear curves (which
             * we call "lines" here) drawn one on top of the other.
             * The background line is gray, and the foreground line drawn on top is
             * typically colored according to the color-by column. Foreground lines are
             * only displayed for the lines that satisfy the brush filter of each axis.
             *
             * Note that we could have used just one line and set its color according to
             * whether it satisfies the brush filters of the axes. However, with this
             * strategy, if the line density is large, gray lines may overlap non
             * gray lines and cause parts of them to be gray as well.
             */
            var LineType;
            (function (LineType) {
                LineType[LineType["FOREGROUND"] = 0] = "FOREGROUND";
                LineType[LineType["BACKGROUND"] = 1] = "BACKGROUND";
            })(LineType = parallel_coords_plot.LineType || (parallel_coords_plot.LineType = {}));
            /**
             * A handle to a representation of a session group in the 'LinesCollection'
             * class below. The handle can also be "null" -- meaning it references no
             * session group (similar to a "null pointer"), in which case the
             * 'sessionGroup()' method returns null.
             *
             * Note: we use this class rather than a simple SessionGroup object so that we
             * won't need to search the DOM for the <path> representing the session group;
             * instead the (foreground) <path> element is stored in the handle.
             */
            var SessionGroupHandle = /** @class */ (function () {
                /**
                 * Constructs a session group handle from a D3 selection of the path
                 * element representing the sessionGroup. This should only be called by the
                 * 'LinesCollection' class below. If sessionGroupSel is empty or undefined, a
                 * "null" handle will be constructed.
                 */
                function SessionGroupHandle(sessionGroupSel) {
                    if (sessionGroupSel === undefined) {
                        sessionGroupSel = d3.selectAll(null);
                    }
                    console.assert(sessionGroupSel.size() <= 1);
                    this._sessionGroupSel = sessionGroupSel;
                }
                /**
                 * @returns the sessionGroup object this handle references or null if
                 * this is a "null" reference.
                 */
                SessionGroupHandle.prototype.sessionGroup = function () {
                    return this._sessionGroupSel.size() === 1
                        ? this._sessionGroupSel.datum()
                        : null;
                };
                SessionGroupHandle.prototype.isNull = function () {
                    return this.sessionGroup() === null;
                };
                /**
                 * Should only be called by the 'LinesCollection' class below.
                 * @returns the d3-selection given on construction.
                 */
                SessionGroupHandle.prototype.selection = function () {
                    return this._sessionGroupSel;
                };
                /**
                 * Compares this handle to 'otherHandle' and returns true if both are null
                 * or both are not null and they reference equal session groups.
                 * Session group equality is determined by their names.
                 */
                SessionGroupHandle.prototype.equalsTo = function (otherHandle) {
                    if (this.isNull()) {
                        return otherHandle.isNull();
                    }
                    if (otherHandle.isNull()) {
                        return false;
                    }
                    return otherHandle.sessionGroup().name == this.sessionGroup().name;
                };
                return SessionGroupHandle;
            }());
            parallel_coords_plot.SessionGroupHandle = SessionGroupHandle;
            ;
            /**
             * Manages the lines representing the session groups. Each session group is
             * represented by two <path> elements with the same control points: a foreground
             * and a background line, with the foreground line always rendered after the
             * background line (it succeeds it in document order). The foreground line is
             * colored based on the value  of the 'color-by' column (specified in options),
             * whereas the background line is gray. The foreground line is displayed only
             * if the session group passes the current axes brush filters. This way, only
             * session groups that pass the current brush filters will be represented by
             * colored lines, and the other session groups will be represented by gray
             * lines.
             *
             * Note that we could have represented each session group with a single line
             * with a color that depends on whether the session group passed the brush
             * filters. However, this would have required us to re-order the DOM to avoid
             * rendering gray lines on top of colored lines (which would look bad,
             * especially if the density of lines is large).
             *
             * This class also stores two SessionGroupHandles: peakedSessionGroupHandle and
             * selectedSessionGroupHandle, and provides methods for updating them. These
             * are used to store the peaked session group: the session group whose line
             * is closest to the mouse point. The peaked session group can be selected
             * by clicking the mouse pointer. The currently selected session group is
             * referenced by the selectedSessionGroupHandle.
             */
            var LinesCollection = /** @class */ (function () {
                function LinesCollection(svgProps, schema, axesCollection) {
                    this._svgProps = svgProps;
                    this._schema = schema;
                    this._axesCollection = axesCollection;
                    this._sessionGroups = [];
                    this._svgProps.svgG.selectAll("g.background").remove();
                    this._svgProps.svgG.selectAll("g.foreground").remove();
                    this._bgPathsSel = this._svgProps.svgG.append("g")
                        .classed("background", true)
                        .selectAll("path");
                    this._fgPathsSel = this._svgProps.svgG.append("g")
                        .classed("foreground", true)
                        .selectAll("path");
                    this._updateVisibleFgPathsSel();
                    this._peakedSessionGroupHandle = new SessionGroupHandle();
                    this._selectedSessionGroupHandle = new SessionGroupHandle();
                    this._d3line = d3.line().curve(d3.curveLinear);
                }
                /**
                 * @returns a SessionGroupHandle referencing the given sessionGroup. If the
                 * given sessionGroup is null or undefined returns a "null" handle.
                 */
                LinesCollection.prototype.getSessionGroupHandle = function (sessionGroup) {
                    if (sessionGroup === null || sessionGroup === undefined) {
                        return new SessionGroupHandle();
                    }
                    return new SessionGroupHandle(this._fgPathsSel.filter(function (sg) { return sg.name === sessionGroup.name; }));
                };
                LinesCollection.prototype.hideBackgroundLines = function () {
                    this._bgPathsSel.attr("visibility", "hidden");
                };
                LinesCollection.prototype.showBackgroundLines = function () {
                    this._bgPathsSel.attr("visibility", null);
                };
                LinesCollection.prototype.peakedSessionGroupHandle = function () {
                    return this._peakedSessionGroupHandle;
                };
                LinesCollection.prototype.selectedSessionGroupHandle = function () {
                    return this._selectedSessionGroupHandle;
                };
                /**
                 * Recomputes the control points of the lines with the given 'type'
                 * (foreground or background) to correspond to the current state of the
                 * axesCollection.
                 *
                 * @param lineType - The type of lines to update.
                 * @param transitionDuration - The lines will be transitioned (animated) to
                 *     their new state. This specifies the duration of that transition. 0
                 *     means no animation.
                 */
                LinesCollection.prototype.recomputeControlPoints = function (lineType, transitionDuration) {
                    var _this_1 = this;
                    if (transitionDuration === void 0) { transitionDuration = 0; }
                    var pathSel = (lineType === LineType.FOREGROUND
                        ? this._fgPathsSel : this._bgPathsSel);
                    pathSel
                        .transition().duration(transitionDuration)
                        .attr("d", function (sessionGroup) { return _this_1._pathDAttribute(sessionGroup); });
                    if (lineType === LineType.FOREGROUND) {
                        // Update the control points property, if we're updating the foreground
                        // lines.
                        window.setTimeout(function () {
                            var _this = _this_1;
                            _this_1._fgPathsSel.each(function (sessionGroup) {
                                // '_this' refers to the 'LinesCollection' instance.
                                _this._setControlPointsProperty(this, sessionGroup);
                            });
                        });
                    }
                };
                /**
                 * Rerenders the foreground lines so that their visibility matches the
                 * current brush filters.
                 */
                LinesCollection.prototype.recomputeForegroundLinesVisibility = function () {
                    var _this_1 = this;
                    this._fgPathsSel.classed("invisible-path", function (sessionGroup) {
                        return !_this_1._axesCollection.allVisibleAxesSatisfy(function (xPosition, axis) {
                            return axis.brushFilter().isPassing(tf.hparams.utils.columnValueByIndex(_this_1._schema, sessionGroup, axis.colIndex()));
                        });
                    });
                    this._updateVisibleFgPathsSel();
                };
                /**
                 * Sets the coloring scheme of the (visible) foreground lines.
                 * A foreground line will be colored by a color corresponding to the value
                 * of the column indexed by colorByColumnIndex in the session group
                 * represented by the line. The color corresponding to a value is
                 * interpolated between minColor and maxColor.
                 */
                LinesCollection.prototype.setForegroundLinesColor = function (colorByColumnIndex, minColor, maxColor) {
                    var lineColorFunction = this._createLineColorFunction(colorByColumnIndex, minColor, maxColor);
                    this._fgPathsSel.attr("stroke", lineColorFunction);
                };
                /**
                 * Updates the sessionGroups, colorByColumnIndex, minColor and maxColor and
                 * redraws the lines.
                 */
                LinesCollection.prototype.redraw = function (sessionGroups, colorByColumnIndex, minColor, maxColor) {
                    var peakedSG = this._peakedSessionGroupHandle.sessionGroup();
                    var selectedSG = this._selectedSessionGroupHandle.sessionGroup();
                    this._sessionGroups = sessionGroups;
                    this._fgPathsSel = this._recomputePathSelection(this._fgPathsSel);
                    this._bgPathsSel = this._recomputePathSelection(this._bgPathsSel);
                    this._peakedSessionGroupHandle = this.getSessionGroupHandle(peakedSG);
                    this._selectedSessionGroupHandle = this.getSessionGroupHandle(selectedSG);
                    this.recomputeControlPoints(LineType.FOREGROUND);
                    this.recomputeControlPoints(LineType.BACKGROUND);
                    this.recomputeForegroundLinesVisibility();
                    this.setForegroundLinesColor(colorByColumnIndex, minColor, maxColor);
                };
                LinesCollection.prototype.updatePeakedSessionGroup = function (newHandle) {
                    this._peakedSessionGroupHandle.selection().classed("peaked-path", false);
                    this._peakedSessionGroupHandle = newHandle;
                    this._peakedSessionGroupHandle.selection().classed("peaked-path", true);
                };
                LinesCollection.prototype.clearPeakedSessionGroup = function () {
                    this.updatePeakedSessionGroup(new SessionGroupHandle());
                };
                LinesCollection.prototype.updateSelectedSessionGroup = function (newHandle) {
                    this._selectedSessionGroupHandle.selection().classed("selected-path", false);
                    this._selectedSessionGroupHandle = newHandle;
                    this._selectedSessionGroupHandle.selection().classed("selected-path", true);
                };
                /**
                 * Returns a handle referencing the closest session group to a given point
                 * in the SVG or a null handle if the closest session group is
                 * too far away.
                 */
                LinesCollection.prototype.findClosestSessionGroup = function (x, y) {
                    var axesPositions = this._axesCollection.mapVisibleAxes(function (xPosition, axis) { return xPosition; });
                    var closestFgPath = tf.hparams.parallel_coords_plot.findClosestPath(this._visibleFgPathsSel.nodes(), axesPositions, [x, y], 
                    /* threshold */ 100);
                    if (closestFgPath === null) {
                        return new SessionGroupHandle();
                    }
                    return new SessionGroupHandle(d3.select(closestFgPath));
                };
                LinesCollection.prototype._createLineColorFunction = function (colorByColumnIndex, minColor, maxColor) {
                    var _this_1 = this;
                    if (colorByColumnIndex === null) {
                        /* Use a default color if no color-by column is selected. */
                        return function () { return "red"; };
                    }
                    var colorScale = d3.scaleLinear()
                        .domain(tf.hparams.utils.numericColumnExtent(this._schema, this._sessionGroups, colorByColumnIndex))
                        .range([minColor, maxColor])
                        .interpolate(d3.interpolateLab);
                    return function (sessionGroup) { return colorScale(tf.hparams.utils.columnValueByIndex(_this_1._schema, sessionGroup, colorByColumnIndex)); };
                };
                LinesCollection.prototype._recomputePathSelection = function (currentPathSel /* d3 selection */) {
                    currentPathSel = currentPathSel
                        .data(this._sessionGroups, /*key=*/ (function (sessionGroup) { return sessionGroup.name; }));
                    currentPathSel.exit().remove();
                    return currentPathSel.enter().append("path").merge(currentPathSel);
                };
                /** Sets the controlPoints property of 'pathElement' to the control-points
                 * array of the given sessionGroup with respect to the current state of
                 * the axesCollection.
                 */
                LinesCollection.prototype._setControlPointsProperty = function (pathElement, sessionGroup) {
                    pathElement.controlPoints = this._computeControlPoints(sessionGroup);
                };
                /** @returns an array of 2-tuples--each representing a control point for
                 * a line representing the given 'sessionGroup'. The control points are
                 * computed with respect to the current state of the axesCollection.
                 */
                LinesCollection.prototype._computeControlPoints = function (sessionGroup) {
                    var _this_1 = this;
                    return this._axesCollection.mapVisibleAxes(function (xPosition, axis) { return [
                        xPosition,
                        axis.yScale()(tf.hparams.utils.columnValueByIndex(_this_1._schema, sessionGroup, axis.colIndex()))
                    ]; });
                };
                LinesCollection.prototype._pathDAttribute = function (sessionGroup) {
                    return this._d3line(this._computeControlPoints(sessionGroup));
                };
                LinesCollection.prototype._updateVisibleFgPathsSel = function () {
                    this._visibleFgPathsSel = this._fgPathsSel.filter(":not(.invisible-path)");
                };
                return LinesCollection;
            }());
            parallel_coords_plot.LinesCollection = LinesCollection;
            function _isInteractiveD3Event(d3Event) {
                return d3.event.sourceEvent !== null;
            }
        })(parallel_coords_plot = hparams.parallel_coords_plot || (hparams.parallel_coords_plot = {}));
    })(hparams = tf.hparams || (tf.hparams = {}));
})(tf || (tf = {})); // namespace tf.hparams.parallel_coords_plot
