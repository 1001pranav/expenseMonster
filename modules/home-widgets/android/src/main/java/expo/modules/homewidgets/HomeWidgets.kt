package expo.modules.homewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/** The last snapshot the app stored, in the app's private preferences. */
object Snapshot {
  private const val PREFS = "expo.modules.homewidgets"
  private const val KEY = "snapshot"

  fun save(context: Context, json: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }

  fun load(context: Context): JSONObject? {
    val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
    return try {
      JSONObject(json).takeIf { it.optInt("v") == 1 }
    } catch (e: Exception) {
      null
    }
  }
}

object HomeWidgets {
  private val providers = listOf(TodayWidget::class.java, MonthWidget::class.java, DuesWidget::class.java)

  fun redrawAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    for (cls in providers) {
      val ids = manager.getAppWidgetIds(ComponentName(context, cls))
      if (ids.isNotEmpty()) cls.getDeclaredConstructor().newInstance().draw(context, manager, ids)
    }
  }

  /** Opens a screen of the app (Expo Router deep link on the app's scheme); the app lock still applies. */
  fun open(context: Context, snapshot: JSONObject?, path: String, requestCode: Int): PendingIntent {
    val scheme = snapshot?.optString("scheme")?.takeIf { it.isNotEmpty() }
    val intent = if (scheme != null) {
      Intent(Intent.ACTION_VIEW, Uri.parse("$scheme://$path")).setPackage(context.packageName)
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
}

/** A widget drawn from the stored snapshot, both when the app updates it and on the 30-minute redraw. */
abstract class SnapshotWidget : AppWidgetProvider() {
  abstract fun render(context: Context, s: JSONObject?, today: LocalDate): RemoteViews

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = draw(context, manager, ids)

  fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = render(context, Snapshot.load(context), LocalDate.now())
    for (id in ids) manager.updateAppWidget(id, views)
  }

  /** The snapshot is from an earlier day (the app hasn't run since): today's figures start at zero. */
  protected fun staleDay(s: JSONObject, today: LocalDate) = s.optString("date") != today.toString()

  protected fun staleMonth(s: JSONObject, today: LocalDate) = s.optString("month") != today.toString().substring(0, 7)
}

class TodayWidget : SnapshotWidget() {
  override fun render(context: Context, s: JSONObject?, today: LocalDate): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.hw_today)
    views.setOnClickPendingIntent(R.id.hw_root, HomeWidgets.open(context, s, "activity", 101))
    if (s == null) {
      views.setTextViewText(R.id.hw_sub, context.getString(R.string.hw_open_app))
      return views
    }
    val day = s.getJSONObject("today")
    val payments = if (staleDay(s, today)) 0 else day.optInt("payments")
    views.setTextViewText(R.id.hw_amount, if (staleDay(s, today)) s.optString("zero") else day.optString("spent"))
    views.setTextViewText(R.id.hw_sub, if (payments == 0) "Nothing spent yet" else if (payments == 1) "1 payment" else "$payments payments")
    return views
  }
}

class MonthWidget : SnapshotWidget() {
  override fun render(context: Context, s: JSONObject?, today: LocalDate): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.hw_month)
    views.setOnClickPendingIntent(R.id.hw_root, HomeWidgets.open(context, s, "", 102))
    views.setTextViewText(R.id.hw_month_title, "Spent in " + today.month.getDisplayName(TextStyle.FULL, Locale.ENGLISH))
    if (s == null) {
      views.setTextViewText(R.id.hw_in_out, context.getString(R.string.hw_open_app))
      views.setViewVisibility(R.id.hw_budget, View.GONE)
      return views
    }
    val zero = s.optString("zero")
    val newMonth = staleMonth(s, today)
    val m = s.getJSONObject("monthly")
    views.setTextViewText(R.id.hw_today, if (staleDay(s, today)) zero else s.getJSONObject("today").optString("spent"))
    views.setTextViewText(R.id.hw_month, if (newMonth) zero else m.optString("spent"))
    views.setTextViewText(
      R.id.hw_in_out,
      when {
        newMonth -> "Money in $zero"
        m.optBoolean("hasIncome") -> "Money in ${m.optString("income")}  ·  ${if (m.optBoolean("overspent")) "Overspent" else "Kept"} ${m.optString("net")}"
        else -> "Money in ${m.optString("income")}"
      },
    )
    val budget = s.optJSONObject("budget")
    if (budget == null || newMonth) {
      views.setViewVisibility(R.id.hw_budget, View.GONE)
      views.setViewVisibility(R.id.hw_budget_label, View.GONE)
    } else {
      views.setViewVisibility(R.id.hw_budget, View.VISIBLE)
      views.setViewVisibility(R.id.hw_budget_label, View.VISIBLE)
      views.setProgressBar(R.id.hw_budget, 100, (budget.optDouble("used") * 100).toInt().coerceIn(0, 100), false)
      views.setTextViewText(R.id.hw_budget_label, budget.optString("label"))
    }
    return views
  }
}

class DuesWidget : SnapshotWidget() {
  private val rows = listOf(
    intArrayOf(R.id.hw_due_1, R.id.hw_due_1_title, R.id.hw_due_1_when, R.id.hw_due_1_amount),
    intArrayOf(R.id.hw_due_2, R.id.hw_due_2_title, R.id.hw_due_2_when, R.id.hw_due_2_amount),
    intArrayOf(R.id.hw_due_3, R.id.hw_due_3_title, R.id.hw_due_3_when, R.id.hw_due_3_amount),
  )

  override fun render(context: Context, s: JSONObject?, today: LocalDate): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.hw_dues)
    views.setOnClickPendingIntent(R.id.hw_root, HomeWidgets.open(context, s, "dues", 103))
    val dues = s?.optJSONArray("dues")
    val count = minOf(dues?.length() ?: 0, rows.size)
    views.setViewVisibility(R.id.hw_empty, if (count == 0) View.VISIBLE else View.GONE)
    if (s != null) views.setTextViewText(R.id.hw_empty, "Nothing due in the next two weeks")
    for ((i, row) in rows.withIndex()) {
      if (i >= count) {
        views.setViewVisibility(row[0], View.GONE)
        continue
      }
      val due = dues!!.getJSONObject(i)
      views.setViewVisibility(row[0], View.VISIBLE)
      views.setTextViewText(row[1], due.optString("title"))
      views.setTextViewText(row[2], whenText(due.optString("date"), today))
      views.setTextViewText(row[3], if (due.isNull("amount")) "" else due.optString("amount"))
    }
    return views
  }

  private fun whenText(date: String, today: LocalDate): String {
    val days = try {
      ChronoUnit.DAYS.between(today, LocalDate.parse(date))
    } catch (e: Exception) {
      return date
    }
    return when {
      days < -1 -> "${-days} days late"
      days == -1L -> "1 day late"
      days == 0L -> "Due today"
      days == 1L -> "Due tomorrow"
      else -> "In $days days"
    }
  }
}
