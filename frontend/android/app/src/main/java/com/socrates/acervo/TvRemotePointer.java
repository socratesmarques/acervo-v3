package com.socrates.acervo;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.HashSet;
import java.util.Set;

/** Cursor nativo: funciona sobre iframes de outra origem sem acessar seu DOM. */
final class TvRemotePointer {
    private final WebView webView;
    private final View decor;
    private final float density;
    private final CursorDrawable cursor = new CursorDrawable();
    private final Runnable hideTask = this::hide;
    private final Set<Integer> pressed = new HashSet<>();
    private boolean enabled;
    private boolean visible;
    private boolean positioned;
    private float x;
    private float y;
    private final View.OnLayoutChangeListener layoutListener = (v, l, t, r, b, ol, ot, or, ob) -> {
        if (r - l != or - ol || b - t != ob - ot) {
            positioned = false;
            hide();
        }
    };

    TvRemotePointer(WebView webView, View decor) {
        this.webView = webView;
        this.decor = decor;
        density = decor.getResources().getDisplayMetrics().density;
        webView.addOnLayoutChangeListener(layoutListener);
    }

    boolean isEnabled() { return enabled; }

    void setEnabled(boolean value) {
        enabled = value;
        positioned = false;
        hide();
    }

    boolean handleKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        boolean direction = key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT
                || key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN;
        boolean click = key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER
                || key == KeyEvent.KEYCODE_NUMPAD_ENTER;
        if (!direction && !click) return false;
        // Consome o UP somente se o DOWN foi tratado aqui (inclusive após abrir o teclado).
        if (event.getAction() == KeyEvent.ACTION_UP) {
            boolean handled = pressed.remove(key);
            if (handled && click && !event.isCanceled() && canPoint()) tap();
            return handled;
        }
        if (event.getAction() != KeyEvent.ACTION_DOWN || !canPoint()) return false;
        pressed.add(key);
        ensurePosition();
        if (direction) {
            float step = density * (event.getRepeatCount() > 8 ? 22 : 10);
            if (key == KeyEvent.KEYCODE_DPAD_LEFT) x -= step;
            if (key == KeyEvent.KEYCODE_DPAD_RIGHT) x += step;
            if (key == KeyEvent.KEYCODE_DPAD_UP) y -= step;
            if (key == KeyEvent.KEYCODE_DPAD_DOWN) y += step;
            // Na borda vertical, mantenha a seta e role a página principal.
            int scroll = Math.round(step * 2);
            if (y < density * 12 && key == KeyEvent.KEYCODE_DPAD_UP) webView.scrollBy(0, -scroll);
            if (y > webView.getHeight() - density * 12 && key == KeyEvent.KEYCODE_DPAD_DOWN) webView.scrollBy(0, scroll);
            clamp();
        }
        show();
        return true;
    }

    private boolean canPoint() {
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
        // Teclado Android e fullscreen nativo continuam com os controles normais.
        return enabled && webView.isShown() && webView.hasWindowFocus()
                && webView.getWidth() > 0 && webView.getHeight() > 0
                && (insets == null || !insets.isVisible(WindowInsetsCompat.Type.ime()));
    }

    private void ensurePosition() {
        if (!positioned) {
            x = webView.getWidth() / 2f;
            y = webView.getHeight() / 2f;
            positioned = true;
        }
        clamp();
    }

    private void clamp() {
        x = Math.max(1, Math.min(webView.getWidth() - 1, x));
        y = Math.max(1, Math.min(webView.getHeight() - 1, y));
    }

    private void tap() {
        ensurePosition();
        show();
        long time = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(time, time, MotionEvent.ACTION_UP, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            webView.dispatchTouchEvent(down);
            webView.dispatchTouchEvent(up);
        } finally {
            down.recycle();
            up.recycle();
        }
    }

    private void show() {
        cursor.setBounds(0, 0, decor.getWidth(), decor.getHeight());
        if (!visible) {
            decor.getOverlay().add(cursor);
            visible = true;
        }
        cursor.invalidateSelf();
        decor.removeCallbacks(hideTask);
        decor.postDelayed(hideTask, 4000);
    }

    void hide() {
        decor.removeCallbacks(hideTask);
        decor.getOverlay().remove(cursor);
        visible = false;
        pressed.clear();
    }

    void dispose() {
        hide();
        webView.removeOnLayoutChangeListener(layoutListener);
    }

    private final class CursorDrawable extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int[] webPosition = new int[2];
        private final int[] decorPosition = new int[2];

        @Override
        public void draw(Canvas canvas) {
            if (!canPoint()) return;
            webView.getLocationOnScreen(webPosition);
            decor.getLocationOnScreen(decorPosition);
            float cx = webPosition[0] - decorPosition[0] + x;
            float cy = webPosition[1] - decorPosition[1] + y;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(density * 5);
            paint.setColor(Color.BLACK);
            canvas.drawCircle(cx, cy, density * 9, paint);
            paint.setStrokeWidth(density * 2);
            paint.setColor(Color.rgb(196, 239, 101));
            canvas.drawCircle(cx, cy, density * 9, paint);
            paint.setStyle(Paint.Style.FILL);
            canvas.drawCircle(cx, cy, density * 2, paint);
        }

        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
