package com.cartridge.controller

import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ControllerPackage : ReactPackage {

    companion object {
        private const val TAG = "ControllerPackage"
    }

    init {
        Log.d(TAG, "ControllerPackage instantiated")
    }

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        Log.d(TAG, "createNativeModules called")
        return listOf(ControllerModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
