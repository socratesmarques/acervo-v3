package com.socrates.acervo;

import android.app.UiModeManager;
import android.content.res.Configuration;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.KeyEvent;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private TvRemotePointer tvPointer;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        tvPointer = new TvRemotePointer(getBridge().getWebView(), getWindow().getDecorView());
        UiModeManager mode = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        boolean television = (mode != null && mode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                || getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEVISION);
        tvPointer.setEnabled(television);
        if (television) {
            Toast.makeText(this, "TV: setas movem o cursor; OK clica. MENU alterna cursor/foco.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (tvPointer != null) {
            // Fallback para TV boxes que não se identificam como Android TV.
            if (event.getKeyCode() == KeyEvent.KEYCODE_MENU) {
                if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) {
                    tvPointer.setEnabled(!tvPointer.isEnabled());
                    Toast.makeText(this, tvPointer.isEnabled() ? "Cursor: setas movem, OK clica" : "Navegação por foco ativada", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
            if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) tvPointer.hide();
            if (tvPointer.handleKeyEvent(event)) return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onPause() {
        if (tvPointer != null) tvPointer.hide();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        if (tvPointer != null) tvPointer.dispose();
        super.onDestroy();
    }
}
