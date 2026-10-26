package expo.modules.caspdf

import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import java.io.File
import java.io.InputStream

/**
 * Words of a PDF with their position, for rebuilding the tables of a consolidated account
 * statement in JavaScript (src/domain/cas.ts). Runs on the phone only; the file and its password
 * never leave it.
 *
 * Result: JSON array of [page, x, y, width, fontSize, text], x/y in points from the top-left.
 * Words in a Devanagari font are left out: some CDSL statements overlay Hindi text on the table.
 */
class CasPdfModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CasPdf")

    OnCreate {
      appContext.reactContext?.let { PDFBoxResourceLoader.init(it) }
    }

    AsyncFunction("readWords") { uri: String, password: String ->
      try {
        open(uri).use { stream ->
          PDDocument.load(stream, password).use { document -> words(document) }
        }
      } catch (e: InvalidPasswordException) {
        throw CodedException(if (password.isEmpty()) "PASSWORD_REQUIRED" else "INCORRECT_PASSWORD", "The PDF's password is needed", e)
      }
    }
  }

  private fun open(uri: String): InputStream =
    when {
      uri.startsWith("content://") ->
        appContext.reactContext?.contentResolver?.openInputStream(Uri.parse(uri)) ?: throw CodedException("PDF_LOAD_ERROR", "Can't open the file", null)
      uri.startsWith("file://") -> File(Uri.parse(uri).path ?: uri.removePrefix("file://")).inputStream()
      else -> File(uri).inputStream()
    }

  private fun words(document: PDDocument): String {
    val out = JSONArray()
    val stripper = object : PDFTextStripper() {
      override fun writeString(text: String?, textPositions: MutableList<TextPosition>?) {
        val positions = textPositions ?: return
        val word = text?.trim() ?: return
        if (word.isEmpty() || positions.isEmpty()) return
        val first = positions.first()
        val last = positions.last()
        val fontName = first.font?.name ?: ""
        if (fontName.contains("Mangal", ignoreCase = true) || word.any { it in 'ऀ'..'ॿ' }) return
        val row = JSONArray()
        row.put(currentPageNo)
        row.put(first.xDirAdj.toDouble())
        row.put(first.yDirAdj.toDouble())
        row.put((last.xDirAdj + last.widthDirAdj - first.xDirAdj).toDouble())
        row.put(first.fontSizeInPt.toDouble())
        row.put(word)
        out.put(row)
      }
    }
    stripper.sortByPosition = true
    stripper.suppressDuplicateOverlappingText = true
    stripper.getText(document)
    return out.toString()
  }
}
