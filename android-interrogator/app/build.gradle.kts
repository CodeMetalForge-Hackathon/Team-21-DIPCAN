plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.team21.dipcan"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.team21.dipcan"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1"
    }
    buildTypes { release { isMinifyEnabled = false } }
    buildFeatures { buildConfig = true }
    val envFile = rootProject.file("../interrogator/.env")
    val defaultKey = if (envFile.exists()) envFile.readLines().firstOrNull { it.startsWith("CHAIN_KEY_HEX=") }?.substringAfter("=")?.trim() ?: "" else ""
    defaultConfig.buildConfigField("String", "DEFAULT_KEY", "\"$defaultKey\"")
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.github.mik3y:usb-serial-for-android:3.7.0")
}
