function runAction(actionName) {
    var csInterface = new CSInterface();
    csInterface.evalScript("runAction('" + actionName + "')");
}