Pod::Spec.new do |s|
  s.name = "MovieEngine"
  s.version = "1.0.0"
  s.summary = "Storage and SMB bridge for Movie Stream Downloader"
  s.license = "MIT"
  s.homepage = "https://github.com/Gish-sp/hls-capture-helper"
  s.authors = { "Movie Engine" => "dev@example.com" }
  s.source = { :git => "https://github.com/Gish-sp/hls-capture-helper.git", :tag => s.version.to_s }
  s.source_files = "ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}"
  s.ios.deployment_target = "15.0"
  s.dependency "Capacitor"
  s.dependency "AMSMB2", "~> 2.7.1"
  s.swift_version = "5.9"
  s.pod_target_xcconfig = {
    "SWIFT_INCLUDE_PATHS" => '$(inherited) "${PODS_ROOT}/AMSMB2/libsmb2/include" "${PODS_ROOT}/AMSMB2/libsmb2/**"',
    "OTHER_SWIFT_FLAGS" => '$(inherited) -Xcc -fmodule-map-file="${PODS_ROOT}/AMSMB2/libsmb2/include/module.modulemap"'
  }
end
