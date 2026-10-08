// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Willen LLC

package phantom.android.branding

import android.app.Application
import android.graphics.drawable.AdaptiveIconDrawable
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import phantom.android.R
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class VisibleBrandCopyTest {
    @Test
    @Config(qualifiers = "en")
    fun englishCopyAndAppLabelUseExactBrand() {
        assertVisibleBrand()
        val context = RuntimeEnvironment.getApplication()
        assertEquals("SHIFROM Messaging", context.getString(R.string.service_channel_name))
        assertEquals("Open SHIFROM", context.getString(R.string.notification_call_open))
        assertEquals("SHIFROM relay", context.getString(R.string.pricing_feature_default_relay))
    }

    @Test
    @Config(qualifiers = "ru")
    fun russianCopyAndAppLabelUseExactBrand() {
        assertVisibleBrand()
        val context = RuntimeEnvironment.getApplication()
        assertEquals("Соединение SHIFROM", context.getString(R.string.service_channel_name))
        assertEquals("Открыть SHIFROM", context.getString(R.string.notification_call_open))
        assertEquals("Ретранслятор SHIFROM", context.getString(R.string.pricing_feature_default_relay))
    }

    @Test
    fun generatedQrShareUsesRebrandedFilename() {
        val source = profileSource()
        assertTrue("File(context.cacheDir, \"shifrom_qr.png\")" in source)
        assertFalse("phantom_qr.png" in source)
    }

    @Test
    @Config(sdk = [26, 35])
    fun suppliedLauncherAndWelcomeArtworkResolve() {
        val context = RuntimeEnvironment.getApplication()
        listOf(R.mipmap.ic_launcher, R.mipmap.ic_launcher_round).forEach { id ->
            val icon = context.getDrawable(id) as AdaptiveIconDrawable
            assertTrue(icon.foreground.intrinsicWidth > 0)
            assertTrue(icon.background.intrinsicWidth > 0)
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                assertTrue(requireNotNull(icon.monochrome).intrinsicWidth > 0)
            }
        }
        listOf(R.drawable.phantom_splash, R.drawable.dv2_logo_phantom, R.drawable.ic_dv2_phantom_premium).forEach { id ->
            val mark = requireNotNull(context.getDrawable(id))
            assertTrue(mark.intrinsicWidth > 0)
            assertEquals(mark.intrinsicWidth, mark.intrinsicHeight)
        }
    }

    private fun assertVisibleBrand() {
        val context = RuntimeEnvironment.getApplication()
        assertEquals("SHIFROM", context.applicationInfo.loadLabel(context.packageManager).toString())
        assertEquals("SHIFROM PREMIUM", context.getString(R.string.pricing_sheet_title))
        assertTrue(context.getString(R.string.terms_section_6_body).contains("abuse@shifrom.com"))
        brandResources.forEach { resource ->
            val name = context.resources.getResourceEntryName(resource)
            val copy = context.getString(resource)
            assertTrue(copy.contains("SHIFROM"), "$name must use the exact SHIFROM wordmark")
            assertFalse(copy.contains("phantom", ignoreCase = true), "$name contains old product branding")
        }
    }

    private fun profileSource(): String {
        var root = File(System.getProperty("user.dir") ?: ".")
        repeat(6) {
            val source = File(root, "apps/android/src/androidMain/kotlin/phantom/android/screens/profile/ProfileScreen.kt")
            if (source.isFile) return source.readText()
            root = root.parentFile ?: root
        }
        error("ProfileScreen.kt not found")
    }

    private val brandResources = listOf(
        R.string.settings_feedback_subject,
        R.string.privacy_mode_description,
        R.string.notification_messages_channel_description,
        R.string.service_channel_name,
        R.string.onboarding_how_title,
        R.string.onboarding_permissions_privacy_note,
        R.string.onboarding_privacy_intro,
        R.string.onboarding_privacy_pro_required,
        R.string.onboarding_privacy_unlock_pro,
        R.string.onboarding_privacy_ghost_a11y,
        R.string.profile_identity_key_subject,
        R.string.profile_invite_subject,
        R.string.profile_my_qr,
        R.string.profile_share_my_contact,
        R.string.profile_public_key_explainer,
        R.string.profile_clipboard_public_key,
        R.string.contact_profile_report_explanation,
        R.string.contact_profile_verified_explanation,
        R.string.verify_confirmed_instruction,
        R.string.qr_scan_instruction,
        R.string.splash_logo,
        R.string.terms_welcome,
        R.string.terms_section_2_body,
        R.string.terms_section_6_title,
        R.string.terms_section_7_title,
        R.string.pricing_feature_default_relay,
        R.string.pricing_sheet_title,
        R.string.migration_explanation,
        R.string.migration_keep_installed,
        R.string.notification_call_open,
    )
}
