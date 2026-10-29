package expo.modules.homewidgets

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app hands over what the widgets show (src/domain/widgets.ts, as JSON) whenever it changes;
 * it is stored for the widgets' own 30-minute redraws and every widget is redrawn now. Amounts
 * arrive already formatted, or masked when the user hides amounts.
 */
class HomeWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HomeWidgets")

    Function("update") { snapshot: String ->
      val context = appContext.reactContext ?: return@Function
      Snapshot.save(context, snapshot)
      HomeWidgets.redrawAll(context)
    }
  }
}
