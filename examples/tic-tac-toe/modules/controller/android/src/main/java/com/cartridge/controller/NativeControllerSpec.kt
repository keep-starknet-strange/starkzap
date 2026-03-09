package com.cartridge.controller

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Base spec class for the Controller module.
 * This is NOT a TurboModule - it's a traditional bridge module
 * that works with both old and new architecture.
 */
abstract class NativeControllerSpec(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    @ReactMethod(isBlockingSynchronousMethod = true)
    abstract fun installRustCrate(): Boolean

    @ReactMethod(isBlockingSynchronousMethod = true)
    abstract fun cleanupRustCrate(): Boolean
}
