package com.nexus.app;

import android.os.Bundle;
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestAllPermissions();
    }

    /**
     * Request microphone, camera, and notification permissions at startup so
     * WebRTC getUserMedia() calls succeed without delay. File uploads go through
     * the system picker, which needs no storage permission on Android 13+.
     */
    private void requestAllPermissions() {
        List<String> needed = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        // Android 12 and below: file uploads read from shared storage
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(
                    this,
                    needed.toArray(new String[0]),
                    PERMISSION_REQUEST_CODE
            );
        }
    }
}
