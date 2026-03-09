package com.cartridge.controller

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ControllerModule.NAME)
class ControllerModule(reactContext: ReactApplicationContext) : NativeControllerSpec(reactContext) {

    companion object {
        const val NAME = "Controller"
        private const val TAG = "ControllerModule"
        private var librariesLoaded = false
        private var jsiInstalled = false

        init {
            loadLibraries()
        }

        @Synchronized
        private fun loadLibraries() {
            if (librariesLoaded) return
            try {
                Log.d(TAG, "Loading controller_uniffi library...")
                System.loadLibrary("controller_uniffi")
                Log.d(TAG, "Loaded controller_uniffi library")
                
                Log.d(TAG, "Loading controller library...")
                System.loadLibrary("controller")
                Log.d(TAG, "Loaded controller library")
                
                librariesLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Failed to load native libraries", e)
            }
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        Log.d(TAG, "initialize() called")
        
        // Auto-install JSI bindings during initialization
        if (!jsiInstalled) {
            installJSIBindings()
        }
    }

    private fun installJSIBindings() {
        val jsContext = reactApplicationContext.javaScriptContextHolder?.get() ?: 0L
        Log.d(TAG, "Installing JSI bindings, jsContext: $jsContext")
        
        if (jsContext == 0L) {
            Log.e(TAG, "jsContext is null or 0, cannot install JSI bindings yet")
            return
        }
        
        try {
            Log.d(TAG, "Calling nativeInstallRustCrate...")
            val result = nativeInstallRustCrate(jsContext)
            Log.d(TAG, "nativeInstallRustCrate returned: $result")
            if (result) {
                jsiInstalled = true
            }
        } catch (e: Exception) {
            Log.e(TAG, "nativeInstallRustCrate failed", e)
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    override fun installRustCrate(): Boolean {
        Log.d(TAG, "installRustCrate() called from JS")
        
        if (jsiInstalled) {
            Log.d(TAG, "JSI bindings already installed")
            return true
        }
        
        val jsContext = reactApplicationContext.javaScriptContextHolder?.get() ?: 0L
        Log.d(TAG, "jsContext: $jsContext")
        
        if (jsContext == 0L) {
            Log.e(TAG, "jsContext is null or 0, cannot install")
            return false
        }
        
        return try {
            Log.d(TAG, "Calling nativeInstallRustCrate...")
            val result = nativeInstallRustCrate(jsContext)
            Log.d(TAG, "nativeInstallRustCrate returned: $result")
            if (result) {
                jsiInstalled = true
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "nativeInstallRustCrate failed", e)
            false
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    override fun cleanupRustCrate(): Boolean {
        Log.d(TAG, "cleanupRustCrate() called from JS")
        val jsContext = reactApplicationContext.javaScriptContextHolder?.get() ?: 0L
        
        if (jsContext == 0L) {
            Log.e(TAG, "jsContext is null or 0, cannot cleanup")
            return false
        }
        
        return try {
            val result = nativeCleanupRustCrate(jsContext)
            Log.d(TAG, "nativeCleanupRustCrate returned: $result")
            if (result) {
                jsiInstalled = false
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "nativeCleanupRustCrate failed", e)
            false
        }
    }

    private external fun nativeInstallRustCrate(jsiPtr: Long): Boolean
    private external fun nativeCleanupRustCrate(jsiPtr: Long): Boolean
}
