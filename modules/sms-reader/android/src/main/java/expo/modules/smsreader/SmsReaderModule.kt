package expo.modules.smsreader

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsPermissionException : CodedException("E_SMS_PERMISSION", "READ_SMS permission not granted", null)

/**
 * Reads the SMS inbox on demand. There is no background receiver: the app scans
 * only when the user opens it or pulls to refresh, and only messages newer than
 * the last scan. Message bodies are parsed in JS and never stored raw.
 */
class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Function("isAvailable") { true }

    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      val context = appContext.reactContext ?: throw CodedException("E_NO_CONTEXT", "No React context", null)
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SmsPermissionException()
      }
      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
      val messages = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        "${Telephony.Sms.DATE} > ?",
        arrayOf(sinceMs.toLong().toString()),
        "${Telephony.Sms.DATE} DESC"
      )?.use { cursor ->
        val idCol = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressCol = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyCol = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateCol = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext() && messages.size < limit) {
          messages.add(
            mapOf(
              "id" to cursor.getString(idCol),
              "address" to (cursor.getString(addressCol) ?: ""),
              "body" to (cursor.getString(bodyCol) ?: ""),
              "date" to cursor.getLong(dateCol).toDouble()
            )
          )
        }
      }
      messages
    }
  }
}
