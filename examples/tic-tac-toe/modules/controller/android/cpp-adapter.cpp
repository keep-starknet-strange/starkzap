#include <jni.h>
#include <jsi/jsi.h>
#include <ReactCommon/CallInvoker.h>
#include <android/log.h>
#include "controller.h"

#define LOG_TAG "ControllerNative"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

using namespace facebook;

// Simple CallInvoker that executes synchronously
class SyncCallInvoker : public react::CallInvoker {
private:
    jsi::Runtime* runtime_;
public:
    explicit SyncCallInvoker(jsi::Runtime* rt) : runtime_(rt) {}
    
    void invokeAsync(react::CallFunc&& func) noexcept override {
        if (runtime_) func(*runtime_);
    }
    void invokeSync(react::CallFunc&& func) override {
        if (runtime_) func(*runtime_);
    }
    void invokeAsync(react::SchedulerPriority, react::CallFunc&& func) noexcept override {
        if (runtime_) func(*runtime_);
    }
};

static bool isInstalled = false;

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_cartridge_controller_ControllerModule_nativeInstallRustCrate(
    JNIEnv* env,
    jobject thiz,
    jlong jsiPtr
) {
    LOGD("nativeInstallRustCrate called with jsiPtr: %ld", (long)jsiPtr);
    
    if (isInstalled) {
        LOGD("Already installed, skipping");
        return JNI_TRUE;
    }
    
    auto* runtime = reinterpret_cast<jsi::Runtime*>(jsiPtr);
    if (runtime == nullptr) {
        LOGE("Runtime pointer is null!");
        return JNI_FALSE;
    }

    LOGD("Creating SyncCallInvoker...");
    auto callInvoker = std::make_shared<SyncCallInvoker>(runtime);
    
    LOGD("Calling controller::installRustCrate...");
    uint8_t result = controller::installRustCrate(*runtime, callInvoker);
    LOGD("installRustCrate returned: %d", result);
    
    if (result) {
        isInstalled = true;
    }
    
    return result ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_cartridge_controller_ControllerModule_nativeCleanupRustCrate(
    JNIEnv* env,
    jobject thiz,
    jlong jsiPtr
) {
    LOGD("nativeCleanupRustCrate called");
    
    auto* runtime = reinterpret_cast<jsi::Runtime*>(jsiPtr);
    if (runtime == nullptr) {
        LOGE("Runtime pointer is null!");
        return JNI_FALSE;
    }

    uint8_t result = controller::cleanupRustCrate(*runtime);
    LOGD("cleanupRustCrate returned: %d", result);
    
    if (result) {
        isInstalled = false;
    }
    
    return result ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"
