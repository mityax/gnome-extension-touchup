
const St = imports.gi.St;
const Main = imports.ui.main;
const EdgeDragAction = imports.ui.edgeDragAction;
const Shell = imports.gi.Shell;
const Lang = imports.lang;

let gesture = new EdgeDragAction.EdgeDragAction(St.Side.BOTTOM, Shell.ActionMode.NORMAL);

function init() {

}

function enable() {
    EdgeDragAction.EDGE_THRESHOLD *= St.ThemeContext.get_for_stage(global.stage).scale_factor;
    log("Scale factor: " + St.ThemeContext.get_for_stage(global.stage).scale_factor + ", new EDGE_THRESHOLD: " + EdgeDragAction.EDGE_THRESHOLD);

    gesture.connect('progress', Lang.bind(this, function(progress) {
        log("Gesture Progress: " + progress);
    }));
    gesture.connect('activated', Lang.bind(this, function() {
        Main.overview.show();
    }));
    global.stage.add_action(gesture);
}

function disable() {
    EdgeDragAction.EDGE_THRESHOLD /= St.ThemeContext.get_for_stage(global.stage).scale_factor;
    global.stage.remove_action(gesture);
}
