package com.nightcode.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.documentfile.provider.DocumentFile
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var projectRoot: DocumentFile? = null
    private var projectName: String = ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        // Restore a previously granted project folder (persistable URI permission).
        restoreProject()

        webView = WebView(this).apply {
            setBackgroundColor(0xFF090A0C.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            // The UI is loaded from file:///android_asset (origin "null"),
            // so without universal access the WebView blocks API calls via CORS.
            settings.allowUniversalAccessFromFileURLs = true
            settings.allowFileAccessFromFileURLs = true
            settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            settings.loadsImagesAutomatically = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.displayZoomControls = false

            if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                WebSettingsCompat.setForceDark(settings, WebSettingsCompat.FORCE_DARK_OFF)
            }

            addJavascriptInterface(AndroidBridge(), "Android")

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val url = request.url.toString()
                    return !(url.startsWith("http://") || url.startsWith("https://"))
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                    Log.d("NightCodeJS", "${message.message()} (line ${message.lineNumber()})")
                    return true
                }
            }
        }

        setContentView(webView)
        webView.loadUrl("file:///android_asset/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("Android")
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_OPEN_TREE -> {
                val uri = data?.data
                if (resultCode == RESULT_OK && uri != null) {
                    try {
                        contentResolver.takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        )
                    } catch (_: SecurityException) {}
                    projectRoot = DocumentFile.fromTreeUri(this, uri)
                    projectName = projectRoot?.name ?: "project"
                    saveProject(uri)
                }
                val name = if (projectRoot != null) jsonString(projectName) else "null"
                js("window.__onProjectPicked && window.__onProjectPicked($name)")
            }
            REQ_OPEN_FILES -> {
                val files = mutableListOf<String>()
                if (resultCode == RESULT_OK && data != null) {
                    val uris = mutableListOf<Uri>()
                    data.data?.let { uris.add(it) }
                    data.clipData?.let { clip ->
                        for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
                    }
                    for (u in uris) {
                        try {
                            val name = queryDisplayName(u) ?: "file"
                            base64InputStream(u)?.let { b64 ->
                                files.add("{\"name\":" + jsonString(name) + ",\"b64\":\"$b64\"}")
                            }
                        } catch (_: Exception) {}
                    }
                }
                js("window.__onFilesPicked && window.__onFilesPicked([" + files.joinToString(",") + "])")
            }
        }
    }

    private fun base64InputStream(uri: Uri): String? = try {
        contentResolver.openInputStream(uri)?.use { ins ->
            Base64.encodeToString(ins.readBytes(), Base64.NO_WRAP)
        }
    } catch (_: Exception) { null }

    private fun js(code: String) {
        webView.post { webView.evaluateJavascript(code) {} }
    }

    private fun saveProject(uri: Uri) {
        getSharedPreferences("nightcode", MODE_PRIVATE)
            .edit()
            .putString("projectUri", uri.toString())
            .putString("projectName", projectName)
            .apply()
    }

    private fun restoreProject() {
        val prefs = getSharedPreferences("nightcode", MODE_PRIVATE)
        val saved = prefs.getString("projectUri", null) ?: return
        try {
            val uri = Uri.parse(saved)
            val persisted = contentResolver.persistedUriPermissions.any {
                it.uri == uri && it.isReadPermission
            }
            if (!persisted) return
            projectRoot = DocumentFile.fromTreeUri(this, uri)
            projectName = prefs.getString("projectName", "") ?: (projectRoot?.name ?: "project")
        } catch (_: Exception) {
            projectRoot = null
        }
    }

    private fun jsonString(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> if (c.code < 0x20) sb.append(String.format("\\u%04x", c.code)) else sb.append(c)
        }
        return sb.append("\"").toString()
    }

    private fun queryDisplayName(uri: Uri): String? {
        try {
            contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) return c.getString(idx)
            }
        } catch (_: Exception) {}
        return uri.lastPathSegment
    }

    /* ── File system bridge: runs on a worker thread, returns result to JS ── */

    private fun fsCallback(cb: String, result: String, error: Boolean) {
        val payload = jsonString(result)
        js("window.__fsResult && window.__fsResult(${jsonString(cb)}, $payload, $error)")
    }

    private fun runFs(op: String, a: String, b: String, cb: String) {
        val root = projectRoot
        if (root == null) {
            fsCallback(cb, "NO_PROJECT", true)
            return
        }
        Thread {
            var result = ""
            var error = false
            try {
                when (op) {
                    "list" -> {
                        val names = mutableListOf<String>()
                        walkFiles(root) { _, rel -> if (names.size < 500) names.add(rel) }
                        result = names.joinToString("\n").ifEmpty { "EMPTY_PROJECT" }
                    }
                    "read" -> {
                        val f = root.findFileRecursive(a)
                        if (f == null) throw Exception("FILE_NOT_FOUND")
                        val bytes = contentResolver.openInputStream(f.uri)?.use { it.readBytes() }
                        if (bytes == null) throw Exception("READ_FAILED")
                        result = String(bytes, Charsets.UTF_8)
                    }
                    "write" -> {
                        val name = a.substringAfterLast('/')
                        val dir = resolveDir(root, a.substringBeforeLast('/', ""), create = true)
                        if (dir == null) throw Exception("WRITE_FAILED")
                        val target = dir.findFile(name)
                            ?: dir.createFile("application/octet-stream", name)
                        if (target == null) throw Exception("WRITE_FAILED")
                        val out = contentResolver.openOutputStream(target.uri, "wt")
                        if (out == null) throw Exception("WRITE_FAILED")
                        out.use { it.write(Base64.decode(b, Base64.NO_WRAP)) }
                        result = "WROTE $a"
                    }
                    "search" -> {
                        val q = a.lowercase()
                        val hits = mutableListOf<String>()
                        walkFiles(root) { file, rel ->
                            if (hits.size < 100 && file.length() in 1..2_000_000) {
                                try {
                                    val text = contentResolver.openInputStream(file.uri)
                                        ?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
                                    if (text.lowercase().contains(q)) hits.add(rel)
                                } catch (_: Exception) {}
                            }
                        }
                        result = hits.joinToString("\n").ifEmpty { "NO_MATCHES" }
                    }
                    "mkdir" -> {
                        if (resolveDir(root, a, create = true) == null) throw Exception("MKDIR_FAILED")
                        result = "CREATED_DIRECTORY $a"
                    }
                    "rename" -> {
                        // SAF's renameTo() only changes the display name in place and is
                        // unreliable across providers, so implement move as copy + delete.
                        val src = root.findFileRecursive(a) ?: throw Exception("FILE_NOT_FOUND")
                        val bytes = contentResolver.openInputStream(src.uri)?.use { it.readBytes() }
                            ?: throw Exception("RENAME_FAILED")
                        val dir = resolveDir(root, b.substringBeforeLast('/', ""), create = true)
                        if (dir == null) throw Exception("RENAME_FAILED")
                        val targetName = b.substringAfterLast('/')
                        val existing = dir.findFile(targetName)
                        if (existing != null && !existing.delete()) throw Exception("RENAME_FAILED")
                        val target = dir.createFile("application/octet-stream", targetName)
                            ?: throw Exception("RENAME_FAILED")
                        val out = contentResolver.openOutputStream(target.uri, "wt")
                        if (out == null) throw Exception("RENAME_FAILED")
                        out.use { it.write(bytes) }
                        if (!src.delete()) throw Exception("RENAME_FAILED")
                        result = "RENAMED $a -> $b"
                    }
                    "delete" -> {
                        val f = root.findFileRecursive(a) ?: throw Exception("FILE_NOT_FOUND")
                        if (!f.delete()) throw Exception("DELETE_FAILED")
                        result = "DELETED $a"
                    }
                    else -> throw Exception("UNKNOWN_OP")
                }
            } catch (e: Exception) {
                result = e.message ?: "ERROR"
                error = true
            }
            fsCallback(cb, result, error)
        }.start()
    }

    private fun walkFiles(root: DocumentFile, visit: (DocumentFile, String) -> Unit) {
        fun rec(dir: DocumentFile, prefix: String, depth: Int) {
            if (depth > 6) return
            val entries = try { dir.listFiles() } catch (_: Exception) { return }
            for (f in entries) {
                val name = f.name ?: continue
                if (f.isDirectory) rec(f, if (prefix.isEmpty()) name else "$prefix/$name", depth + 1)
                else visit(f, if (prefix.isEmpty()) name else "$prefix/$name")
            }
        }
        rec(root, "", 0)
    }

    private fun resolveDir(root: DocumentFile, path: String, create: Boolean): DocumentFile? {
        var dir = root
        for (part in path.split('/').filter { it.isNotBlank() }) {
            val next = dir.findFile(part)?.takeIf { it.isDirectory }
                ?: if (create) dir.createDirectory(part) else null
            if (next == null) return null
            dir = next
        }
        return dir
    }

    private fun DocumentFile.findFileRecursive(path: String): DocumentFile? {
        val parts = path.split('/').filter { it.isNotBlank() }
        if (parts.isEmpty()) return null
        var dir = this
        for (i in 0 until parts.size - 1) {
            dir = dir.findFile(parts[i])?.takeIf { it.isDirectory } ?: return null
        }
        return dir.findFile(parts.last())
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun openFilePicker() {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
            startActivityForResult(intent, REQ_OPEN_FILES)
        }

        @JavascriptInterface
        fun openProjectPicker() {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            startActivityForResult(intent, REQ_OPEN_TREE)
        }

        @JavascriptInterface
        fun hasProject(): Boolean = projectRoot != null

        @JavascriptInterface
        fun getProjectName(): String = if (projectRoot != null) projectName else ""

        @JavascriptInterface
        fun fsList(cb: String) { runFs("list", "", "", cb) }

        @JavascriptInterface
        fun fsRead(path: String, cb: String) { runFs("read", path, "", cb) }

        @JavascriptInterface
        fun fsWrite(path: String, contentB64: String, cb: String) { runFs("write", path, contentB64, cb) }

        @JavascriptInterface
        fun fsSearch(query: String, cb: String) { runFs("search", query, "", cb) }

        @JavascriptInterface
        fun fsMkdir(path: String, cb: String) { runFs("mkdir", path, "", cb) }

        @JavascriptInterface
        fun fsRename(from: String, to: String, cb: String) { runFs("rename", from, to, cb) }

        @JavascriptInterface
        fun fsDelete(path: String, cb: String) { runFs("delete", path, "", cb) }

        @JavascriptInterface
        fun openUrl(url: String) {
            if (url.startsWith("https://") || url.startsWith("http://")) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
        }
    }

    companion object {
        private const val REQ_OPEN_TREE = 1002
        private const val REQ_OPEN_FILES = 1001
    }
}
